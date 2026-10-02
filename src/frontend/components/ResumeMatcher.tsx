import { useState } from 'react'
import Field from './Field'
import ResumeDocument from './ResumeDocument'
import ResumeEditor from './ResumeEditor'
import { downloadResumePdf } from '../lib/resumePdf'
import { analyzeJobKeywords, getPhotoAdvice, scrapeJobReal } from '../lib/backend'
import type { ScrapedJob } from '../lib/backend'
import { DEV } from '../dev'
import { validateJobUrl } from '../lib/validate'
import { DEFAULT_APPEARANCE } from '../types'
import type { BankPhoto, GeneratedResume, LayoutId, PhotoAdvice, ResumeAppearance, SavedResume, TailoringPoint } from '../types'
import { dataBankToFacts } from '../lib/dataBank'
import type { DataBank } from '../lib/dataBank'
import { generateFromConfirmedFacts } from '../lib/generateFromFacts'
import { tailorWithLlm } from '../lib/llmTailoring'
import type { GeneratedFromFacts } from '../lib/generateFromFacts'
import { loadActiveTemplateId, loadTemplates } from '../lib/docxTemplate'
import { gapsFillableFromConfirmed, requirementsFromJobText, splitMatches } from '../lib/requirementMatch'
import type { JobRequirement } from '../lib/requirementMatch'
import '../styles/ResumeMatcher.css'

interface ResumeMatcherProps {
  /** Everything in the Data Bank; the resume is built from it as is */
  dataBank: DataBank
  saved: SavedResume[]
  onSave: (entry: Omit<SavedResume, 'id' | 'savedAt'>) => void
  photoBank: BankPhoto[]
  onPhotoBankChange: (photos: BankPhoto[]) => void
  onViewSaved: () => void
}

const defaultName = (url: string) => {
  let host = 'Tailored'
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { /* keep default */ }
  return `Resume – ${host}`
}

export default function ResumeMatcher({ dataBank, saved, onSave, photoBank, onPhotoBankChange, onViewSaved }: ResumeMatcherProps) {
  const [jobUrl, setJobUrl] = useState('')
  const [jobText, setJobText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [resume, setResume] = useState<GeneratedResume | null>(null)
  const [tailoring, setTailoring] = useState<TailoringPoint[]>([])
  const [appearance, setAppearance] = useState<ResumeAppearance>(DEFAULT_APPEARANCE)
  const [editing, setEditing] = useState(false)
  const [runId, setRunId] = useState(0)
  const [job, setJob] = useState<ScrapedJob | null>(null)
  const [photoAdvice, setPhotoAdvice] = useState<PhotoAdvice | undefined>()
  const [error, setError] = useState('')
  const [urlError, setUrlError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const [pack, setPack] = useState<GeneratedFromFacts | null>(null)
  const [reuseNote, setReuseNote] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!jobUrl.trim() && !jobText.trim()) {
      setError('Paste a job link or the job description.')
      return
    }
    const problem = jobUrl.trim() ? validateJobUrl(jobUrl) : ''
    setUrlError(problem)
    if (problem) return
    setSaving(false)
    setJustSaved(false)
    setResume(null)
    setTailoring([])
    setJob(null)
    setEditing(false)
    setLeaving(true)

    await new Promise((resolve) => setTimeout(resolve, 300)) // let the link card fade out
    setLeaving(false)
    setIsLoading(true)

    try {
      let description = jobText.trim()
      let listingUrl = jobUrl.trim()
      let scraped: ScrapedJob | null = null
      if (listingUrl) {
        scraped = await scrapeJobReal(listingUrl)
        if (scraped.job_description.trim()) {
          description = scraped.job_description.trim()
          setJobText(description)
        }
      }
      if (!description) {
        throw new Error('No job description was found. Paste the posting text and try again.')
      }
      let requirements: JobRequirement[]
      try {
        requirements = await analyzeJobKeywords(description)
        if (requirements.length === 0) requirements = requirementsFromJobText(description)
      } catch {
        requirements = requirementsFromJobText(description)
      }
      const facts = dataBankToFacts(dataBank)
      const template = loadTemplates().find((item) => item.id === loadActiveTemplateId())
      if (template && (template.id === 'centered' || template.id === 'left' || template.id === 'banner' || template.id === 'sidebar')) {
        setAppearance((current) => ({ ...current, layout: template.id as LayoutId }))
      }
      const pageLimit = template?.pageLimit ?? 1
      const listing: ScrapedJob = { ...scraped, url: listingUrl, job_description: description }
      let generated = generateFromConfirmedFacts(facts, requirements, pageLimit)
      if (generated.factIds.length === 0) {
        throw new Error('There’s nothing to build a resume from yet. Add some experience or projects with a few bullet points in the Data Bank, or upload your resume there.')
      }
      if (DEV.useRealTailoring) {
        try {
          generated = await tailorWithLlm(facts, listing, generated.resume, pageLimit)
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'unknown error'
          generated.tailoring.unshift({
            id: 'llm-unavailable',
            area: 'Tailoring',
            detail: `Claude tailoring wasn’t available (${reason}), so this draft uses your confirmed facts as written.`,
          })
        }
      }
      const reusable = saved.find((item) => {
        const match = splitMatches(requirements, item.keywordBank ?? [])
        return (item.keywordBank?.length ?? 0) > 0 && match.requiredMissing.length === 0
      })
      const fillable = gapsFillableFromConfirmed(
        splitMatches(requirements, generated.keywordBank).requiredMissing,
        facts.filter((fact) => fact.assertion_status === 'confirmed').map((fact) => ({ factId: fact.id, text: fact.valueText })),
      )
      setReuseNote(
        reusable
          ? `${reusable.name} already covers the required qualifications. You can reuse it instead of generating another.`
          : fillable.length > 0
            ? 'Some missing requirements are covered by details in your Data Bank and were considered for this draft. Anything still missing stays missing.'
            : 'Missing requirements aren’t covered by anything in your Data Bank, so they were not added.',
      )
      const advice = await getPhotoAdvice(listing)
      setJob(listing)
      setPack(generated)
      setResume(generated.resume)
      setTailoring(generated.tailoring)
      setPhotoAdvice(advice)
      setRunId((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process job listing. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const downloadPDF = () => {
    if (!resume) return
    downloadResumePdf(resume, appearance, defaultName(jobUrl))
  }

  const tailorAnother = () => {
    setResume(null)
    setTailoring([])
    setJob(null)
    setEditing(false)
    setSaving(false)
    setJustSaved(false)
    setJobUrl('')
    setUrlError('')
  }

  const startSave = () => {
    setSaveName(defaultName(jobUrl))
    setSaveError('')
    setSaving(true)
  }

  const confirmSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!saveName.trim()) {
      setSaveError('Give this resume a name so you can find it later.')
      return
    }
    if (!resume) return
    onSave({
      name: saveName.trim(),
      jobUrl: jobUrl.trim(),
      appearance,
      photoAdvice,
      resume,
      keywordBank: pack?.keywordBank ?? [],
      templateId: loadActiveTemplateId(),
      templateVersion: loadTemplates().find((item) => item.id === loadActiveTemplateId())?.version ?? 1,
      factIds: pack?.factIds ?? [],
      validation: pack?.validation,
    })
    setSaving(false)
    setJustSaved(true)
  }

  return (
    <div className="matcher-container">
      {!isLoading && !resume && (
      <form onSubmit={handleSubmit} className={`job-form${leaving ? ' leaving' : ''}`} noValidate>
        <Field
          id="job-url"
          label="Job Listing URL"
          type="url"
          value={jobUrl}
          error={urlError}
          disabled={leaving}
          placeholder="https://company.com/careers/job-title"
          onChange={(v) => {
            setJobUrl(v)
            if (urlError) setUrlError('')
          }}
        />
        <Field
          id="job-text"
          label="Job description"
          multiline
          rows={8}
          full
          required
          value={jobText}
          placeholder={'Required qualifications\nFive years of Python\nPython or Java\n\nPreferred qualifications\nPublic speaking'}
          onChange={setJobText}
        />
        <button type="submit" className="btn btn-primary" disabled={leaving}>
          Generate Tailored Resume
        </button>
        {error && <div className="error-message">{error}</div>}
      </form>
      )}

      {isLoading && (
        <div className="loader-card" role="status" aria-live="polite">
          <svg className="loader-atom" viewBox="0 0 64 64" aria-hidden="true">
            <ellipse className="orbit" cx="32" cy="32" rx="28" ry="10" />
            <ellipse className="orbit" cx="32" cy="32" rx="28" ry="10" transform="rotate(60 32 32)" />
            <ellipse className="orbit" cx="32" cy="32" rx="28" ry="10" transform="rotate(120 32 32)" />
            <circle className="nucleus" cx="32" cy="32" r="5" />
          </svg>
          <p className="loader-title">Tailoring your resume</p>
          <p className="loader-sub">Reading the listing and matching it to your Data Bank…</p>
        </div>
      )}

      {resume && (
        <div className={`results-container${editing ? ' is-editing' : ''}`}>
          <div className="resume-section">
            <div className="section-header">
              <div className="header-row">
                <h2>Resume Preview</h2>
                <button onClick={tailorAnother} className="btn-ghost">
                  Tailor another
                </button>
              </div>
              <div className="action-bar">
                <button onClick={() => setEditing((v) => !v)} className="btn btn-secondary">
                  {editing ? 'Done Editing' : 'Edit'}
                </button>
                <button onClick={downloadPDF} className="btn btn-secondary">
                  Download PDF
                </button>
                <button onClick={startSave} className="btn btn-primary" disabled={saving}>
                  Save to My Resumes
                </button>
              </div>
            </div>

            {saving && (
              <form className="save-form" onSubmit={confirmSave} noValidate>
                <Field
                  id="save-name"
                  label="Resume Name"
                  value={saveName}
                  required
                  error={saveError}
                  onChange={(v) => { setSaveName(v); if (saveError) setSaveError('') }}
                />
                <div className="save-form-actions">
                  <button type="submit" className="btn btn-primary">Save</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setSaving(false)}>Cancel</button>
                </div>
              </form>
            )}

            {justSaved && !saving && (
              <p className="save-notice">
                Saved. <button type="button" className="link-btn" onClick={onViewSaved}>View in My Resumes</button>
              </p>
            )}

            <ResumeDocument resume={resume} appearance={appearance} />
          </div>

          <div className="side-panel">
            {DEV.useRealScraper && job && (
              <details className="changelog-section scraped-listing">
                <summary>Scraped job listing</summary>
                <p className="panel-note">{job.url}</p>
                <pre className="scraped-text">{job.job_description}</pre>
              </details>
            )}
            {editing ? (
              <div className="changelog-section">
                <h2>Edit Resume</h2>
                <p className="panel-note">Changes show in the preview as you type.</p>
                <ResumeEditor
                  key={runId}
                  resume={resume}
                  onChange={setResume}
                  appearance={appearance}
                  onAppearanceChange={setAppearance}
                  photoBank={photoBank}
                  onPhotoBankChange={onPhotoBankChange}
                  photoAdvice={photoAdvice}
                />
              </div>
            ) : (
              <div className="changelog-section">
                <h2>How It’s Tailored</h2>
                <p className="panel-note">Built from confirmed facts. {reuseNote}</p>
                {pack && !pack.validation.ok && (
                  <p className="panel-note">{pack.validation.problems.join(' ')}</p>
                )}
                <div className="changelog-list">
                  {tailoring.map((t, i) => (
                    <div key={t.id} className="changelog-item" style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
                      <span className="section-tag">{t.area}</span>
                      <p className="tailor-detail">{t.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
