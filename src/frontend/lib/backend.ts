import { DEV } from '../dev'
import { DUMMY_PHOTO_ADVICE, DUMMY_RESUME, DUMMY_TAILORING } from './dummyData'
import type { GeneratedResume, PhotoAdvice, TailoringPoint } from '../types'

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
  if (!res.ok) throw new Error(body?.error ?? `The scraper failed (HTTP ${res.status}).`)
  return body as ScrapedJob
}

/** Job listing text for a URL: real or placeholder depending on dev.ts. */
export async function fetchJobListing(url: string): Promise<ScrapedJob> {
  if (DEV.useRealScraper) return scrapeJobReal(url)
  await sleep(600)
  return { url, job_description: '' }
}

/** Tailored resume plus notes on how it was tailored. */
export async function tailorResume(_job: ScrapedJob): Promise<{ resume: GeneratedResume; tailoring: TailoringPoint[] }> {
  if (DEV.useRealTailoring) throw notHooked('Resume tailoring', 'useRealTailoring')
  await sleep(1300)
  return { resume: structuredClone(DUMMY_RESUME), tailoring: structuredClone(DUMMY_TAILORING) }
}

/** Whether a photo suits this job. */
export async function getPhotoAdvice(_job: ScrapedJob): Promise<PhotoAdvice> {
  if (DEV.useRealPhotoAdvice) throw notHooked('Photo advice', 'useRealPhotoAdvice')
  return { ...DUMMY_PHOTO_ADVICE }
}
