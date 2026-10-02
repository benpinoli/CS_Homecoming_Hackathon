import { useState } from 'react'
import Field from './Field'
import PhotoEditor from './PhotoEditor'
import StylePicker from './StylePicker'
import { resolveStyle } from '../lib/resumeStyles'
import { photoRingColor } from '../lib/photo'
import type { BankPhoto, GeneratedResume, PhotoAdvice, ResumeAppearance } from '../types'
import '../styles/ResumeEditor.css'

interface ResumeEditorProps {
  resume: GeneratedResume
  onChange: (resume: GeneratedResume) => void
  appearance: ResumeAppearance
  onAppearanceChange: (appearance: ResumeAppearance) => void
  photoBank: BankPhoto[]
  onPhotoBankChange: (photos: BankPhoto[]) => void
  photoAdvice?: PhotoAdvice
}

type Experience = GeneratedResume['experience'][number]
type Project = GeneratedResume['projects'][number]
type Education = GeneratedResume['education'][number]

const blank = (v: string, msg: string) => (v.trim() ? '' : msg)

export default function ResumeEditor({ resume, onChange, appearance, onAppearanceChange, photoBank, onPhotoBankChange, photoAdvice }: ResumeEditorProps) {
  // Skills are typed as free text and parsed on change, so keep the raw string locally
  const [skillsText, setSkillsText] = useState(resume.skills.join(', '))

  const set = <K extends keyof GeneratedResume>(key: K, value: GeneratedResume[K]) =>
    onChange({ ...resume, [key]: value })

  const patchAt = <T,>(list: T[], i: number, patch: Partial<T>) =>
    list.map((item, j) => (j === i ? { ...item, ...patch } : item))
  const removeAt = <T,>(list: T[], i: number) => list.filter((_, j) => j !== i)
  const bulletsOf = (v: string) => v.split('\n')

  const emptyExperience: Experience = { company: '', position: '', location: '', duration: '', bullets: [''] }
  const emptyProject: Project = { name: '', technologies: '', link: '', bullets: [''] }
  const emptyEducation: Education = { school: '', degree: '', field: '', year: '', details: '' }

  return (
    <div className="resume-editor">
      <details className="editor-section" open>
        <summary>Appearance</summary>
        <div className="editor-section-body">
          <StylePicker value={appearance} onChange={onAppearanceChange} />
        </div>
      </details>

      <details className="editor-section">
        <summary>Photo</summary>
        <div className="editor-section-body">
          <PhotoEditor
            photo={resume.photo}
            bank={photoBank}
            onBankChange={onPhotoBankChange}
            advice={photoAdvice}
            layout={appearance.layout}
            ringColor={photoRingColor(appearance.layout, resolveStyle(appearance).accent)}
            onChange={(photo) => set('photo', photo)}
          />
        </div>
      </details>

      <details className="editor-section" open>
        <summary>Contact</summary>
        <div className="editor-section-body">
        <div className="editor-grid">
          <Field id="ed-name" label="Full Name" required value={resume.name}
            error={blank(resume.name, 'Your name can’t be left blank.')}
            onChange={(v) => set('name', v)} />
          <Field id="ed-email" label="Email" value={resume.email} onChange={(v) => set('email', v)} />
          <Field id="ed-phone" label="Phone" value={resume.phone} onChange={(v) => set('phone', v)} />
          <Field id="ed-location" label="Location" value={resume.location} onChange={(v) => set('location', v)} />
          <Field id="ed-links" label="Links" multiline rows={2} full value={resume.links.join('\n')}
            hint="One per line." onChange={(v) => set('links', v.split('\n'))} />
        </div>
      </div>
      </details>

      <details className="editor-section">
        <summary>Summary</summary>
        <div className="editor-section-body">
        <Field id="ed-summary" label="Professional Summary" multiline rows={3} value={resume.summary}
          onChange={(v) => set('summary', v)} />
      </div>
      </details>

      <details className="editor-section">
        <summary>Experience</summary>
        <div className="editor-section-body">
        {resume.experience.map((e, i) => (
          <div key={i} className="editor-entry">
            <div className="editor-entry-head">
              <span>{e.position || 'New role'}</span>
              <button type="button" className="delete-btn" aria-label="Remove role"
                onClick={() => set('experience', removeAt(resume.experience, i))}>✕</button>
            </div>
            <div className="editor-grid">
              <Field id={`ed-exp-${i}-pos`} label="Job Title" required value={e.position}
                error={blank(e.position, 'Add the job title.')}
                onChange={(v) => set('experience', patchAt(resume.experience, i, { position: v }))} />
              <Field id={`ed-exp-${i}-co`} label="Company" required value={e.company}
                error={blank(e.company, 'Add the company name.')}
                onChange={(v) => set('experience', patchAt(resume.experience, i, { company: v }))} />
              <Field id={`ed-exp-${i}-loc`} label="Location" value={e.location}
                onChange={(v) => set('experience', patchAt(resume.experience, i, { location: v }))} />
              <Field id={`ed-exp-${i}-dur`} label="Dates" value={e.duration}
                onChange={(v) => set('experience', patchAt(resume.experience, i, { duration: v }))} />
              <Field id={`ed-exp-${i}-b`} label="Bullets" multiline rows={4} full value={e.bullets.join('\n')}
                hint="One bullet per line."
                onChange={(v) => set('experience', patchAt(resume.experience, i, { bullets: bulletsOf(v) }))} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary"
          onClick={() => set('experience', [...resume.experience, emptyExperience])}>+ Add Role</button>
      </div>
      </details>

      <details className="editor-section">
        <summary>Projects</summary>
        <div className="editor-section-body">
        {resume.projects.map((p, i) => (
          <div key={i} className="editor-entry">
            <div className="editor-entry-head">
              <span>{p.name || 'New project'}</span>
              <button type="button" className="delete-btn" aria-label="Remove project"
                onClick={() => set('projects', removeAt(resume.projects, i))}>✕</button>
            </div>
            <div className="editor-grid">
              <Field id={`ed-proj-${i}-name`} label="Project Name" required value={p.name}
                error={blank(p.name, 'Give the project a name.')}
                onChange={(v) => set('projects', patchAt(resume.projects, i, { name: v }))} />
              <Field id={`ed-proj-${i}-link`} label="Link" value={p.link}
                onChange={(v) => set('projects', patchAt(resume.projects, i, { link: v }))} />
              <Field id={`ed-proj-${i}-tech`} label="Tools & Skills Used" full value={p.technologies}
                onChange={(v) => set('projects', patchAt(resume.projects, i, { technologies: v }))} />
              <Field id={`ed-proj-${i}-b`} label="Bullets" multiline rows={3} full value={p.bullets.join('\n')}
                hint="One bullet per line."
                onChange={(v) => set('projects', patchAt(resume.projects, i, { bullets: bulletsOf(v) }))} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary"
          onClick={() => set('projects', [...resume.projects, emptyProject])}>+ Add Project</button>
      </div>
      </details>

      <details className="editor-section">
        <summary>Education</summary>
        <div className="editor-section-body">
        {resume.education.map((e, i) => (
          <div key={i} className="editor-entry">
            <div className="editor-entry-head">
              <span>{[e.degree, e.school].filter(Boolean).join(' · ') || 'New entry'}</span>
              <button type="button" className="delete-btn" aria-label="Remove education"
                onClick={() => set('education', removeAt(resume.education, i))}>✕</button>
            </div>
            <div className="editor-grid">
              <Field id={`ed-edu-${i}-school`} label="School" required value={e.school}
                error={blank(e.school, 'Add the name of the school.')}
                onChange={(v) => set('education', patchAt(resume.education, i, { school: v }))} />
              <Field id={`ed-edu-${i}-deg`} label="Degree" value={e.degree}
                onChange={(v) => set('education', patchAt(resume.education, i, { degree: v }))} />
              <Field id={`ed-edu-${i}-field`} label="Field of Study" value={e.field}
                onChange={(v) => set('education', patchAt(resume.education, i, { field: v }))} />
              <Field id={`ed-edu-${i}-year`} label="Date" value={e.year}
                onChange={(v) => set('education', patchAt(resume.education, i, { year: v }))} />
              <Field id={`ed-edu-${i}-det`} label="Details" full value={e.details}
                onChange={(v) => set('education', patchAt(resume.education, i, { details: v }))} />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-secondary"
          onClick={() => set('education', [...resume.education, emptyEducation])}>+ Add Education</button>
      </div>
      </details>

      <details className="editor-section">
        <summary>Skills</summary>
        <div className="editor-section-body">
        <Field id="ed-skills" label="Skills" multiline rows={2} value={skillsText}
          hint="Separate with commas."
          onChange={(v) => {
            setSkillsText(v)
            set('skills', v.split(',').map((s) => s.trim()).filter(Boolean))
          }} />
      </div>
      </details>
    </div>
  )
}
