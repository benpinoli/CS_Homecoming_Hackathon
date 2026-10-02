import type { BankFact } from './experienceBank.ts'
import type { DataSectionId } from '../types'

export type Entry = { id: string } & Record<string, string>

export interface FieldDef {
  key: string
  label: string
  placeholder?: string
  hint?: string
  required?: boolean
  multiline?: boolean
  rows?: number
  full?: boolean
  type?: string
  /** Shown instead of "<label> is required" */
  missing?: string
}

export interface SectionDef {
  id: DataSectionId
  nav: string
  title: string
  blurb: string
  /** Single fixed entry (no add/remove) */
  single?: boolean
  addLabel?: string
  empty?: string
  entryLabel?: (e: Entry, index: number) => string
  fields: FieldDef[]
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'profile',
    nav: 'Contact & Summary',
    title: 'Contact & Summary',
    blurb: 'The header of every resume. Recruiters and ATS parsers look here first, so keep it accurate.',
    single: true,
    fields: [
      { key: 'name', label: 'Full Name', placeholder: 'Jane Doe', required: true, missing: 'Add your name so it can appear at the top of the resume.' },
      { key: 'email', label: 'Email', placeholder: 'jane@example.com', required: true, type: 'email', missing: 'An email address is how employers will reach you.' },
      { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567' },
      { key: 'location', label: 'Location', placeholder: 'Denver, CO', hint: 'City and state is enough. No street address needed.' },
      { key: 'linkedin', label: 'LinkedIn', placeholder: 'linkedin.com/in/janedoe' },
      { key: 'website', label: 'Website / Portfolio', placeholder: 'janedoe.com' },
      { key: 'summary', label: 'Professional Summary', placeholder: '2–3 sentences: who you are, what you do best, and what you are looking for.', multiline: true, rows: 3, full: true },
    ],
  },
  {
    id: 'experience',
    nav: 'Work Experience',
    title: 'Work Experience',
    blurb: 'Paid roles, newest first. Lead each bullet with an action verb and include numbers where you can.',
    addLabel: 'Add Experience',
    empty: 'No work experience yet. Add a job.',
    entryLabel: (e) => [e.position, e.company].filter(Boolean).join(' · '),
    fields: [
      { key: 'company', label: 'Company', placeholder: 'Acme Corp', required: true, missing: 'Which company was this with?' },
      { key: 'position', label: 'Job Title', placeholder: 'Operations Manager', required: true, missing: 'Add the title you held.' },
      { key: 'location', label: 'Location', placeholder: 'Denver, CO (or Remote)' },
      { key: 'startDate', label: 'Start Date', placeholder: 'Jun 2021', required: true, missing: 'When did you start? Month and year is ideal.' },
      { key: 'endDate', label: 'End Date', placeholder: 'Aug 2023 or Present', required: true, missing: 'Add an end date, or type "Present" if you still work here.' },
      { key: 'description', label: 'Achievements', placeholder: 'One bullet per line:\nImproved X by doing Y, resulting in Z', multiline: true, rows: 5, full: true, required: true, missing: 'Describe what you did. Add at least one bullet.', hint: 'One bullet per line. Format: action + what + measurable result.' },
    ],
  },
  {
    id: 'education',
    nav: 'Education',
    title: 'Education',
    blurb: 'Degrees, diplomas, and other formal schooling or training.',
    addLabel: 'Add Education',
    empty: 'No education yet.',
    entryLabel: (e) => [e.degree, e.school].filter(Boolean).join(' · '),
    fields: [
      { key: 'school', label: 'School', placeholder: 'University of Colorado', required: true, missing: 'Add the name of the school.' },
      { key: 'degree', label: 'Degree', placeholder: 'B.A.', required: true, missing: 'Add the degree you earned or are pursuing.' },
      { key: 'field', label: 'Field of Study', placeholder: 'Business Administration', required: true, missing: 'What was your major or field of study?' },
      { key: 'location', label: 'Location', placeholder: 'Boulder, CO' },
      { key: 'startDate', label: 'Start', placeholder: 'Aug 2018' },
      { key: 'endDate', label: 'End / Graduation', placeholder: 'May 2022', required: true, missing: 'Add when you finished, or expect to finish.' },
      { key: 'gpa', label: 'GPA', placeholder: '3.8', hint: 'Optional. Usually only worth including if it is strong.' },
      { key: 'details', label: 'Honors & Relevant Coursework', placeholder: "Honors, relevant coursework, thesis…", multiline: true, rows: 2, full: true },
    ],
  },
  {
    id: 'projects',
    nav: 'Projects',
    title: 'Projects',
    blurb: 'Notable work outside your regular jobs: initiatives, campaigns, research, portfolio pieces, side ventures. Show what you did and what it achieved.',
    addLabel: 'Add Project',
    empty: 'No projects yet. Add something you led or created.',
    entryLabel: (e) => e.name,
    fields: [
      { key: 'name', label: 'Project Name', placeholder: 'Community Garden Launch', required: true, missing: 'Give the project a name.' },
      { key: 'role', label: 'Your Role', placeholder: 'Organizer, lead, contributor…' },
      { key: 'technologies', label: 'Tools & Skills Used', placeholder: 'Budgeting, Excel, public speaking', required: true, missing: 'List the tools or skills you used so they can be matched to jobs.' },
      { key: 'link', label: 'Link', placeholder: 'yoursite.com/project', hint: 'Optional. A page where someone can see the work.' },
      { key: 'startDate', label: 'Start Date', placeholder: 'Jan 2024' },
      { key: 'endDate', label: 'End Date', placeholder: 'Mar 2024 or Ongoing' },
      { key: 'description', label: 'Description', placeholder: 'One bullet per line:\nOrganized 40 volunteers to build 12 garden beds', multiline: true, rows: 5, full: true, required: true, missing: 'Describe what the project does and what you contributed.', hint: 'One bullet per line. Mention scale, users, or results if you have them.' },
    ],
  },
  {
    id: 'skills',
    nav: 'Skills',
    title: 'Skills',
    blurb: 'Group by category. These are the keywords applicant tracking systems scan for.',
    addLabel: 'Add Skill',
    empty: 'No skills yet.',
    entryLabel: (e) => e.name,
    fields: [
      { key: 'name', label: 'Skill', placeholder: 'TypeScript', required: true, missing: 'Enter the skill name.' },
      { key: 'category', label: 'Category', placeholder: 'Technical', hint: 'For example: Technical, Software, Languages, Leadership.' },
    ],
  },
  {
    id: 'volunteer',
    nav: 'Volunteer & Leadership',
    title: 'Volunteer & Leadership',
    blurb: 'Clubs, service, community or religious roles, board seats. Anything that shows initiative or leadership.',
    addLabel: 'Add Volunteer Role',
    empty: 'No volunteer or leadership roles yet.',
    entryLabel: (e) => [e.role, e.organization].filter(Boolean).join(' · '),
    fields: [
      { key: 'organization', label: 'Organization', placeholder: 'Local Food Bank', required: true, missing: 'Which organization was this with?' },
      { key: 'role', label: 'Role', placeholder: 'Volunteer Coordinator', required: true, missing: 'Add your role or title.' },
      { key: 'startDate', label: 'Start Date', placeholder: 'Sep 2022' },
      { key: 'endDate', label: 'End Date', placeholder: 'May 2023 or Present' },
      { key: 'description', label: 'Description', placeholder: 'One bullet per line', multiline: true, rows: 4, full: true },
    ],
  },
  {
    id: 'certifications',
    nav: 'Certifications & Awards',
    title: 'Certifications & Awards',
    blurb: 'Licenses, certifications, scholarships, and other recognition.',
    addLabel: 'Add Certification / Award',
    empty: 'No certifications or awards yet.',
    entryLabel: (e) => e.name,
    fields: [
      { key: 'name', label: 'Name', placeholder: 'Project Management Professional (PMP)', required: true, missing: 'Add the name of the certification or award.' },
      { key: 'issuer', label: 'Issuer', placeholder: 'Project Management Institute' },
      { key: 'date', label: 'Date', placeholder: 'Mar 2024' },
    ],
  },
]

export const blankEntry = (def: SectionDef): Entry => {
  const entry: Entry = { id: Date.now().toString() + Math.random().toString(36).slice(2, 6) }
  def.fields.forEach((f) => { entry[f.key] = '' })
  return entry
}

export const initialData = (): DataBank => {
  const data = {} as DataBank
  SECTIONS.forEach((s) => { data[s.id] = s.single ? [{ ...blankEntry(s), id: 'profile' }] : [] })
  return data
}

export const errorFor = (f: FieldDef, value: string): string => {
  if (f.required && !value.trim()) return f.missing ?? `${f.label} can't be left blank.`
  if (f.type === 'email' && value.trim() && !/^\S+@\S+\.\S+$/.test(value.trim())) {
    return "That doesn't look like a valid email address."
  }
  return ''
}

/** Everything in the Data Bank, by section. The Contact section always holds exactly one entry. */
export type DataBank = Record<DataSectionId, Entry[]>

const STORAGE_KEY = 'resume-inator.data-bank'

/** Saved Data Bank, repaired so missing sections or newly added fields never break the page */
export function loadDataBank(): DataBank {
  const fresh = initialData()
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Record<string, unknown> | null
    if (!saved || typeof saved !== 'object') return fresh
    for (const def of SECTIONS) {
      const rows = saved[def.id]
      if (!Array.isArray(rows)) continue
      const entries = rows
        .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
        .map((r) => {
          const entry = blankEntry(def)
          if (typeof r.id === 'string' && r.id) entry.id = r.id
          def.fields.forEach((f) => { if (typeof r[f.key] === 'string') entry[f.key] = r[f.key] as string })
          return entry
        })
      fresh[def.id] = def.single ? [entries[0] ?? fresh[def.id][0]] : entries
    }
  } catch {
    /* unreadable: start empty */
  }
  return fresh
}

export function saveDataBank(data: DataBank): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* storage full or unavailable; the page still works for this visit */
  }
}

// ---------- Data Bank -> the facts the resume generator reads ----------

const BULLET_GLYPH = /^\s*[•●▪◦*\-–—]\s+/
/** One bullet per line of a multi-line field */
const bulletLines = (text: string | undefined) =>
  (text ?? '').split('\n').map((l) => l.replace(BULLET_GLYPH, '').trim()).filter(Boolean)

/**
 * The resume is built from whatever is in the Data Bank, typed by hand or imported. There is no separate
 * confirmation step: everything here is trusted, so every fact carries the "confirmed" status the generator expects.
 */
export function dataBankToFacts(data: DataBank): BankFact[] {
  const facts: BankFact[] = []
  let n = 0
  const add = (entityId: string, section: string, key: string, text: string | undefined) => {
    const valueText = (text ?? '').trim()
    if (!valueText) return
    facts.push({ id: `${entityId}:${key}:${n++}`, entityId, section, key, valueText, assertion_status: 'confirmed' })
  }

  const p = data.profile[0]
  if (p) {
    add('person', 'person', 'full_name', p.name)
    add('person', 'person', 'email', p.email)
    add('person', 'person', 'phone', p.phone)
    add('person', 'person', 'location', p.location)
    add('person', 'person', 'linkedin_url', p.linkedin)
    add('person', 'person', 'portfolio_url', p.website)
    add('person', 'person', 'summary', p.summary)
  }

  // Volunteer roles are listed with experience, since a resume has no separate place for them here
  for (const e of [...data.experience, ...data.volunteer]) {
    const volunteer = 'organization' in e
    const id = e.id
    add(id, 'experience', 'organization', volunteer ? e.organization : e.company)
    add(id, 'experience', 'title', volunteer ? e.role : e.position)
    add(id, 'experience', 'location', e.location)
    add(id, 'experience', 'start_date', e.startDate)
    add(id, 'experience', 'end_date', e.endDate)
    bulletLines(e.description).forEach((line) => add(id, 'experience', 'personal_responsibilities', line))
  }

  for (const e of data.projects) {
    add(e.id, 'projects', 'name', e.name)
    add(e.id, 'projects', 'tools_used', e.technologies)
    add(e.id, 'projects', 'public_url', e.link)
    add(e.id, 'projects', 'start_date', e.startDate)
    add(e.id, 'projects', 'end_date', e.endDate)
    bulletLines(e.description).forEach((line) => add(e.id, 'projects', 'personal_contributions', line))
  }

  for (const e of data.education) {
    add(e.id, 'education', 'institution', e.school)
    add(e.id, 'education', 'degree', e.degree)
    add(e.id, 'education', 'field', e.field)
    add(e.id, 'education', 'location', e.location)
    add(e.id, 'education', 'start_date', e.startDate)
    add(e.id, 'education', 'end_date', e.endDate)
    if (e.gpa?.trim()) add(e.id, 'education', 'honors', `GPA ${e.gpa.trim()}`)
    bulletLines(e.details).forEach((line) => add(e.id, 'education', 'honors', line))
  }

  for (const e of data.skills) {
    add(e.id, 'skills', 'name', e.name)
    add(e.id, 'skills', 'category', e.category)
  }

  return facts
}
