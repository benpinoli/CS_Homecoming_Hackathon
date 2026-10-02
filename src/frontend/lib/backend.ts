import { DEV } from '../dev'
import { DUMMY_PHOTO_ADVICE, DUMMY_RESUME_IMPORT } from './dummyData'
import { parse_resume } from '../../parse_resume.ts'
import type { ResumeExtraction } from '../../parse_resume.ts'
import { extractionToResumeImport } from './extractionToDataBank.ts'
import { requirementsFromAnalysis, type AnalyzedRequirement, type JobRequirement } from './requirementMatch.ts'
import type { PhotoAdvice, ResumeImport } from '../types'

/** What web_scraper/scraper.py produces (job_posting.json) */
export interface ScrapedJob {
  url: string
  job_description: string
  title?: string | null
  company?: string | null
  location?: string | null
  /** Which strategy found the posting, e.g. "greenhouse_api", "json_ld", "html_generic" */
  source?: string
}

/** Scraper failure that still carries what the scraper produced, so the Demo tab can show it */
export class ScraperError extends Error {
  data?: ScrapedJob
  log?: string
  constructor(message: string, data?: ScrapedJob, log?: string) {
    super(message)
    this.data = data
    this.log = log
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const notHooked = (what: string, flag: keyof typeof DEV) =>
  new Error(`${what} isn’t connected to the backend yet. Set ${flag} to false in src/frontend/dev.ts to use placeholder data.`)

/** Always calls the real scraper (used by the Demo tab regardless of dev.ts). */
export async function scrapeJobReal(url: string): Promise<ScrapedJob> {
  let res: Response
  try {
    res = await fetch(`/api/scrape?url=${encodeURIComponent(url)}`)
  } catch {
    throw new Error('Couldn’t reach the scraper. Make sure the app is running with `npm run dev`.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ScraperError(body?.error ?? `The scraper failed (HTTP ${res.status}).`, body?.data, body?.log)
  return body as ScrapedJob
}

/** Structured requirements from the scraped or pasted description. Throws if the model call fails. */
export async function analyzeJobKeywords(description: string): Promise<JobRequirement[]> {
  let res: Response
  try {
    res = await fetch('/api/analyze-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_description: description }),
    })
  } catch {
    throw new Error('Couldn’t reach job analysis. Make sure the app is running with `npm run dev`.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? `Job analysis failed (HTTP ${res.status}).`)
  return requirementsFromAnalysis((body?.requirements ?? []) as AnalyzedRequirement[])
}

/** Job listing text for a URL: real or placeholder depending on dev.ts. */
export async function fetchJobListing(url: string): Promise<ScrapedJob> {
  if (DEV.useRealScraper) return scrapeJobReal(url)
  await sleep(600)
  return { url, job_description: '' }
}

/** One bullet from llm_app, with the profile fact ids it is based on. */
export interface TailoredBullet {
  text: string
  source_fact_ids: string[]
}

/** Response of llm_app's POST /api/tailor (see src/backend/llm_app/app/schemas/tailoring.py). */
export interface TailorApiResponse {
  model: string
  resume: {
    headline: string | null
    summary: string
    skills: string[]
    entries: Array<{
      source_entity_id: string
      section: 'experience' | 'project' | 'education' | 'leadership' | 'volunteering' | 'other'
      title: string
      organization: string | null
      dates: string | null
      bullets: TailoredBullet[]
    }>
    keyword_coverage: { matched: string[]; missing: string[] }
    change_notes: string[]
  }
}

/**
 * Ask llm_app to tailor a profile to a job. /api/tailor is proxied by vite.config.ts to uvicorn on :8000,
 * so llm_app must be running (see src/backend/llm_app/README.md).
 */
export async function tailorResume(
  profile: Record<string, unknown>,
  job: ScrapedJob,
  instructions?: string,
): Promise<TailorApiResponse> {
  let res: Response
  try {
    res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile, job, instructions }),
    })
  } catch {
    throw new Error('Couldn’t reach resume tailoring. Make sure the app is running with `npm run dev`.')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    if (!body && res.status >= 500) {
      throw new Error('llm_app isn’t running. Start it with `uvicorn app.main:app --port 8000` in src/backend/llm_app.')
    }
    const detail = typeof body?.detail === 'string' ? body.detail : body?.error
    throw new Error(detail ?? `Resume tailoring failed (HTTP ${res.status}).`)
  }
  return body as TailorApiResponse
}

/** Whether a photo suits this job. */
export async function getPhotoAdvice(job: ScrapedJob): Promise<PhotoAdvice> {
  void job // will be sent to the backend once this is hooked up
  if (DEV.useRealPhotoAdvice) throw notHooked('Photo advice', 'useRealPhotoAdvice')
  return { ...DUMMY_PHOTO_ADVICE }
}

/**
 * Read an uploaded resume file into Data Bank entries.
 * The real parser returns an evidence-backed profile; extractionToDataBank.ts converts it into the form fields.
 */
export async function parseResumeFile(file: File): Promise<ResumeImport> {
  if (!DEV.useRealResumeParser) {
    await sleep(1500)
    return structuredClone(DUMMY_RESUME_IMPORT)
  }
  return extractionToResumeImport(await parse_resume(file))
}

/**
 * Always runs the real resume parser (used by the Demo tab regardless of dev.ts).
 *
 * parse_resume() (src/parse_resume.ts) reads the file in the browser (PDFs via pdf.js, text/markdown as-is),
 * splits it into blocks, and POSTs them to /api/parse-resume. The dev server (vite.config.ts) answers by calling
 * Claude with the prompts and schemas in src/backend/resume_json_builder/resume_bank_kit; it needs
 * ANTHROPIC_API_KEY in .env.local.
 */
export async function parseResumeReal(file: File): Promise<ResumeExtraction> {
  return parse_resume(file)
}
