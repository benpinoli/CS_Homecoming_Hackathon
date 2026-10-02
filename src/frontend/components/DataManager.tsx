import { useState } from 'react'
import Field from './Field'
import PhotoBank from './PhotoBank'
import type { BankPhoto } from '../types'
import '../styles/DataManager.css'

type SectionId =
  | 'profile'
  | 'experience'
  | 'education'
  | 'projects'
  | 'skills'
  | 'volunteer'
  | 'certifications'

type Entry = { id: string } & Record<string, string>

interface FieldDef {
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

interface SectionDef {
  id: SectionId
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

const SECTIONS: SectionDef[] = [
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

const blankEntry = (def: SectionDef): Entry => {
  const entry: Entry = { id: Date.now().toString() + Math.random().toString(36).slice(2, 6) }
  def.fields.forEach((f) => { entry[f.key] = '' })
  return entry
}

const initialData = (): Record<SectionId, Entry[]> => {
  const data = {} as Record<SectionId, Entry[]>
  SECTIONS.forEach((s) => { data[s.id] = s.single ? [{ ...blankEntry(s), id: 'profile' }] : [] })
  return data
}

const errorFor = (f: FieldDef, value: string): string => {
  if (f.required && !value.trim()) return f.missing ?? `${f.label} can't be left blank.`
  if (f.type === 'email' && value.trim() && !/^\S+@\S+\.\S+$/.test(value.trim())) {
    return "That doesn't look like a valid email address."
  }
  return ''
}

interface DataManagerProps {
  photos: BankPhoto[]
  onPhotosChange: (photos: BankPhoto[]) => void
}

export default function DataManager({ photos, onPhotosChange }: DataManagerProps) {
  const [activeSection, setActiveSection] = useState<SectionId | 'photos'>('profile')
  const [data, setData] = useState<Record<SectionId, Entry[]>>(initialData)

  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

  const addEntry = (def: SectionDef) =>
    setData((d) => ({ ...d, [def.id]: [...d[def.id], blankEntry(def)] }))

  const deleteEntry = (sectionId: SectionId, id: string) =>
    setData((d) => ({ ...d, [sectionId]: d[sectionId].filter((e) => e.id !== id) }))

  const updateEntry = (sectionId: SectionId, id: string, key: string, value: string) =>
    setData((d) => ({
      ...d,
      [sectionId]: d[sectionId].map((e) => (e.id === id ? { ...e, [key]: value } : e)),
    }))

  // Count blank required fields (and bad emails) per section, for the sidebar
  const issueCount = (def: SectionDef) =>
    data[def.id].reduce(
      (n, e) => n + def.fields.filter((f) => errorFor(f, e[f.key])).length,
      0,
    )

  return (
    <div className="data-manager">
      <aside className="data-sidebar">
        <h2>Data Bank</h2>
        <nav className="data-nav">
          {SECTIONS.map((s) => {
            const issues = issueCount(s)
            return (
              <button
                key={s.id}
                className={`data-nav-item ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <span className="nav-label">{s.nav}</span>
                {issues > 0 && (
                  <span className="nav-badge warn" title={`${issues} field${issues > 1 ? 's' : ''} need attention`}>{issues}</span>
                )}
              </button>
            )
          })}
          <button
            className={`data-nav-item ${activeSection === 'photos' ? 'active' : ''}`}
            onClick={() => setActiveSection('photos')}
          >
            <span className="nav-label">Photos</span>
          </button>
        </nav>
      </aside>

      {activeSection === 'photos' ? (
        <PhotoBank photos={photos} onChange={onPhotosChange} />
      ) : (
      <section className="data-content" key={section.id}>
        <div className="section-title">
          <div>
            <h2>{section.title}</h2>
            <p className="section-blurb">{section.blurb}</p>
          </div>
          <div className="section-actions">
            {!section.single && (
              <button onClick={() => addEntry(section)} className="btn btn-primary">
                + {section.addLabel}
              </button>
            )}
          </div>
        </div>

        <div className="entry-list">
          {data[section.id].length === 0 && <p className="empty-state">{section.empty}</p>}
          {data[section.id].map((entry, i) => (
            <div key={entry.id} className="entry-card">
              {!section.single && (
                <div className="entry-head">
                  <span className="entry-title">
                    {section.entryLabel?.(entry, i) || `New entry`}
                  </span>
                  <button
                    onClick={() => deleteEntry(section.id, entry.id)}
                    className="delete-btn"
                    aria-label="Delete entry"
                    title="Delete entry"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="entry-grid">
                {section.fields.map((f) => {
                  const key = `${entry.id}.${f.key}`
                  return (
                    <Field
                      key={f.key}
                      id={`${section.id}-${key}`}
                      label={f.label}
                      value={entry[f.key]}
                      required={f.required}
                      multiline={f.multiline}
                      rows={f.rows}
                      full={f.full}
                      type={f.type}
                      placeholder={f.placeholder}
                      hint={f.hint}
                      error={errorFor(f, entry[f.key])}
                      onChange={(v) => updateEntry(section.id, entry.id, f.key, v)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  )
}
