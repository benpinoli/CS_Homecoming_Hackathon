/// <reference types="vite/client" />

import {
  blocksFromPdfTextItems,
  segmentResumeIntoBlocks,
  type PdfTextItem,
} from './resume_ingest.ts'

export { segmentResumeIntoBlocks }

/**
 * Resume parsing entry point for the frontend.
 *
 * Usage (e.g. on "Parse resume" click):
 *   const result = await parse_resume(file)
 *
 * By default this POSTs to `/api/parse-resume` (Vite dev middleware when configured).
 * Override with `options.apiUrl` or `VITE_PARSE_RESUME_API_URL`.
 */

export type ResumeSourceBlock = {
  locator: string
  text: string
}

export type ResumeInputSource = {
  source_id: string
  source_type: 'resume'
  source_label: string
  blocks: ResumeSourceBlock[]
}

export type ParseResumeApiRequest = {
  profile_id: string
  person_entity_id: string
  captured_at: string
  sources: ResumeInputSource[]
  /** Locators with no extractable text, such as a blank PDF page. */
  ingestion_unprocessed_blocks?: string[]
}

export type UnmappedPassage = {
  source_id: string
  locator: string
  quote: string
  reason: string
}

export type ExtractionReport = {
  input_source_ids: string[]
  processed_input_blocks: string[]
  unprocessed_input_blocks: string[]
  unmapped_passages: UnmappedPassage[]
  warnings: string[]
  needs_user_review: true
}

/** Evidence-backed profile proposal from the resume parser (see resume bank kit). */
export type CandidateProfile = {
  schema_version: '1.0'
  profile_id: string
  revision: number
  is_fictional_example: boolean
  updated_at: string
  sources: unknown[]
  evidence: unknown[]
  person: unknown
  education: unknown[]
  experience: unknown[]
  projects: unknown[]
  skills: unknown[]
  awards: unknown[]
  certifications: unknown[]
  publications: unknown[]
  volunteering: unknown[]
  languages: unknown[]
  preferences: unknown[]
  other_experiences: unknown[]
  inventory_coverage: unknown[]
  open_questions: unknown[]
  conflicts: unknown[]
}

export type ResumeExtraction = {
  candidate_profile: CandidateProfile
  extraction_report: ExtractionReport
}

export type ParseResumeTextInput = {
  text: string
  fileName?: string
}

export type ParseResumeOptions = {
  /** POST target for the parser service. Defaults to `/api/parse-resume`. */
  apiUrl?: string
  profileId?: string
  personEntityId?: string
  capturedAt?: string
  signal?: AbortSignal
}

export class ParseResumeError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ParseResumeError'
    this.status = status
  }
}

const TEXT_EXTENSIONS = new Set(['.txt', '.text', '.md', '.markdown'])
const PDF_EXTENSION = '.pdf'

const DEFAULT_API_URL =
  (import.meta.env.VITE_PARSE_RESUME_API_URL as string | undefined) ??
  '/api/parse-resume'

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : ''
}

async function readPdfBlocks(file: File): Promise<{
  blocks: ResumeSourceBlock[]
  unreadableLocators: string[]
}> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const data = new Uint8Array(await file.arrayBuffer())
  const document = await pdfjs.getDocument({ data }).promise
  const pages: PdfTextItem[][] = []

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) {
        continue
      }
      const transform = item.transform
      items.push({
        str: item.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
      })
    }
    pages.push(items)
  }

  return blocksFromPdfTextItems(pages)
}

async function readResumeBlocks(file: File): Promise<{
  blocks: ResumeSourceBlock[]
  unreadableLocators: string[]
}> {
  const ext = extensionOf(file.name)
  if (ext === PDF_EXTENSION) {
    const ingested = await readPdfBlocks(file)
    if (ingested.blocks.length === 0) {
      throw new ParseResumeError(
        'No readable text found in the resume. Scanned PDFs may need OCR.',
      )
    }
    return ingested
  }
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new ParseResumeError(
      `Unsupported resume format "${ext || '(no extension)'}". ` +
        `Supported: ${[...TEXT_EXTENSIONS, PDF_EXTENSION].join(', ')}.`,
    )
  }
  const text = await file.text()
  const blocks = segmentResumeIntoBlocks(text)
  if (blocks.length === 0) {
    throw new ParseResumeError('Resume file is empty.')
  }
  return { blocks, unreadableLocators: [] }
}

export function buildParseResumeRequest(
  fileName: string,
  blocks: ResumeSourceBlock[],
  ids?: Pick<ParseResumeOptions, 'profileId' | 'personEntityId' | 'capturedAt'>,
  unreadableLocators: string[] = [],
): ParseResumeApiRequest {
  const capturedAt = ids?.capturedAt ?? new Date().toISOString()
  const sourceId = createId('source_resume')

  if (blocks.length === 0) {
    throw new ParseResumeError('No readable content found in the resume.')
  }

  return {
    profile_id: ids?.profileId ?? createId('profile'),
    person_entity_id: ids?.personEntityId ?? createId('person'),
    captured_at: capturedAt,
    ingestion_unprocessed_blocks: unreadableLocators,
    sources: [
      {
        source_id: sourceId,
        source_type: 'resume',
        source_label: fileName,
        blocks,
      },
    ],
  }
}

function assertResumeExtraction(value: unknown): ResumeExtraction {
  if (!value || typeof value !== 'object') {
    throw new ParseResumeError('Parser returned a non-object response.')
  }
  const record = value as Record<string, unknown>
  if (!record.candidate_profile || !record.extraction_report) {
    throw new ParseResumeError(
      'Parser response is missing candidate_profile or extraction_report.',
    )
  }
  return value as ResumeExtraction
}

/**
 * Ingest a resume file and run the LLM extraction step.
 */
export async function parse_resume(
  input: File | ParseResumeTextInput,
  options: ParseResumeOptions = {},
): Promise<ResumeExtraction> {
  const file =
    input instanceof File
      ? input
      : new File([input.text], input.fileName ?? 'resume.txt', {
          type: 'text/plain',
        })

  const ingested = await readResumeBlocks(file)
  const payload = buildParseResumeRequest(
    file.name,
    ingested.blocks,
    options,
    ingested.unreadableLocators,
  )
  const apiUrl = options.apiUrl ?? DEFAULT_API_URL

  let response: Response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }
    throw new ParseResumeError(
      `Could not reach resume parser at ${apiUrl}. Is the dev API running?`,
    )
  }

  const bodyText = await response.text()
  if (!response.ok) {
    let detail = bodyText
    try {
      const parsed = JSON.parse(bodyText) as { error?: string; message?: string }
      detail = parsed.error ?? parsed.message ?? bodyText
    } catch {
      // use raw body
    }
    throw new ParseResumeError(
      detail || `Resume parser failed (${response.status}).`,
      response.status,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText) as unknown
  } catch {
    throw new ParseResumeError('Resume parser returned invalid JSON.')
  }

  return assertResumeExtraction(parsed)
}
