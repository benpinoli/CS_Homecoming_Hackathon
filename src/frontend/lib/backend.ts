import { DEV } from '../dev'
import { DUMMY_PHOTO_ADVICE, DUMMY_RESUME, DUMMY_RESUME_IMPORT, DUMMY_TAILORING } from './dummyData'
import { parse_resume } from '../../parse_resume.ts'
import type { ResumeExtraction } from '../../parse_resume.ts'
import type { GeneratedResume, PhotoAdvice, ResumeImport, TailoringPoint } from '../types'

/** What web_scraper/scraper.py produces (job_posting.json) */
export interface ScrapedJob {
  url: string
  job_description: string
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

/** Job listing text for a URL: real or placeholder depending on dev.ts. */
export async function fetchJobListing(url: string): Promise<ScrapedJob> {
  if (DEV.useRealScraper) return scrapeJobReal(url)
  await sleep(600)
  return { url, job_description: '' }
}

/** Tailored resume plus notes on how it was tailored. */
export async function tailorResume(job: ScrapedJob): Promise<{ resume: GeneratedResume; tailoring: TailoringPoint[] }> {
  void job // will be sent to the backend once this is hooked up
  if (DEV.useRealTailoring) throw notHooked('Resume tailoring', 'useRealTailoring')
  await sleep(1300)
  return { resume: structuredClone(DUMMY_RESUME), tailoring: structuredClone(DUMMY_TAILORING) }
}

/** Whether a photo suits this job. */
export async function getPhotoAdvice(job: ScrapedJob): Promise<PhotoAdvice> {
  void job // will be sent to the backend once this is hooked up
  if (DEV.useRealPhotoAdvice) throw notHooked('Photo advice', 'useRealPhotoAdvice')
  return { ...DUMMY_PHOTO_ADVICE }
}

/**
 * Read an uploaded resume file into Data Bank entries.
 * When the real parser exists, send `file` to it here and convert its candidate_profile into ParsedResume
 * (see src/backend/resume_json_builder/resume_bank_kit/resume_extraction.schema.json).
 */
export async function parseResumeFile(file: File): Promise<ResumeImport> {
  void file // will be uploaded once the parser is hooked up
  if (DEV.useRealResumeParser) throw notHooked('Resume import', 'useRealResumeParser')
  await sleep(1500)
  return structuredClone(DUMMY_RESUME_IMPORT)
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
