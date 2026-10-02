/** Page structure only: where things go */
export type LayoutId = 'centered' | 'left' | 'banner' | 'sidebar'
export type FontId = 'serif' | 'lato' | 'inter' | 'plex'
export type ColorId = 'navy' | 'teal' | 'charcoal' | 'burgundy' | 'slate'

/** The three independent choices that make up how a resume looks */
export interface ResumeAppearance {
  layout: LayoutId
  font: FontId
  color: ColorId
}

export const DEFAULT_APPEARANCE: ResumeAppearance = { layout: 'centered', font: 'serif', color: 'navy' }

/** One way the resume was fitted to the job listing */
export interface TailoringPoint {
  id: string
  area: string
  detail: string
}

export type PhotoShape = 'circle' | 'rounded' | 'square' | 'portrait'
export type PhotoPlacement = 'left' | 'right' | 'top'
export type PhotoSize = 'sm' | 'md' | 'lg'

/** An image stored in the Data Bank */
export interface BankPhoto {
  id: string
  name: string
  /** Downscaled JPEG data URL */
  src: string
  w: number
  h: number
}

/** A photo placed on one resume, with its own crop and look */
export interface ResumePhoto {
  photoId: string
  src: string
  w: number
  h: number
  /** 1 = image just covers the frame */
  zoom: number
  /** Point of the image (0..1) shown at the center of the frame */
  fx: number
  fy: number
  shape: PhotoShape
  placement: PhotoPlacement
  size: PhotoSize
  ring: boolean
}

/** Whether a photo suits the job listing, and why */
export interface PhotoAdvice {
  recommended: boolean
  reason: string
}

export interface GeneratedResume {
  name: string
  email: string
  phone: string
  location: string
  links: string[]
  summary: string
  experience: Array<{
    company: string
    position: string
    location: string
    duration: string
    bullets: string[]
  }>
  projects: Array<{
    name: string
    technologies: string
    link: string
    bullets: string[]
  }>
  education: Array<{
    school: string
    degree: string
    field: string
    year: string
    details: string
  }>
  skills: string[]
  photo?: ResumePhoto | null
}

export interface SavedResume {
  id: string
  name: string
  savedAt: string
  jobUrl: string
  appearance: ResumeAppearance
  photoAdvice?: PhotoAdvice
  resume: GeneratedResume
}

/** Data Bank sections (Photos are handled separately) */
export type DataSectionId =
  | 'profile'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'volunteer'
  | 'certifications'

/** Text fields per Data Bank section, keyed like the fields in DataManager (e.g. experience: company, position, ...) */
export type ParsedResume = Partial<Record<DataSectionId, Array<Record<string, string>>>>

/** What a resume parser hands back to the Data Bank */
export interface ResumeImport {
  data: ParsedResume
  /** Things the parser wasn't sure about, shown to the user for review */
  warnings: string[]
}
