import { useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import Field from './Field'
import PhotoBank from './PhotoBank'
import { parseResumeFile } from '../lib/backend'
import TemplateSetup from './TemplateSetup'
import { SECTIONS, blankEntry, errorFor } from '../lib/dataBank'
import type { DataBank, Entry, SectionDef } from '../lib/dataBank'
import { loadActiveTemplateId, loadTemplates, saveActiveTemplateId, saveCustomTemplates } from '../lib/docxTemplate'
import type { ResumeTemplate } from '../lib/docxTemplate'
import { DEV } from '../dev'
import { findDuplicates, similar } from '../lib/duplicates'
import type { DupInfo } from '../lib/duplicates'
import type { BankPhoto, DataSectionId, ParsedResume } from '../types'
import '../styles/DataManager.css'

type SectionId = DataSectionId

const withoutKey = (record: Record<string, string>, key: string) => {
  const next = { ...record }
  delete next[key]
  return next
}

interface DataManagerProps {
  /** The Data Bank's contents. Owned by App so they are saved and the resume generator can use them. */
  data: DataBank
  setData: Dispatch<SetStateAction<DataBank>>
  photos: BankPhoto[]
  onPhotosChange: (photos: BankPhoto[]) => void
}

export default function DataManager({ data, setData, photos, onPhotosChange }: DataManagerProps) {
  const [activeSection, setActiveSection] = useState<SectionId | 'photos' | 'templates'>('profile')
  const [templates, setTemplates] = useState<ResumeTemplate[]>(() => loadTemplates())
  const [activeTemplateId, setActiveTemplateId] = useState(() => loadActiveTemplateId())

  const section = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]

  // ---- Import from an existing resume ----
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState<{
    file: string
    counts: string[]
    warnings: string[]
    duplicates: string[]
    conflicts: number
    replaced: boolean
  } | null>(null)

  /** Ben's behavior: a new upload replaces what is stored instead of adding to it */
  const [replaceExisting, setReplaceExisting] = useState(false)

  /** Entries the user said are not duplicates after all */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  /** Contact fields where the resume disagreed with what was already stored: field key -> the resume's value */
  const [profileConflicts, setProfileConflicts] = useState<Record<string, string>>({})

  // Possible duplicates are always worked out from the current entries, so they also appear (and go away)
  // as you edit, not only right after an import. The later of two look-alikes is the one flagged.
  const dupes = useMemo(() => {
    const out = {} as Record<SectionId, Map<string, DupInfo>>
    for (const def of SECTIONS) {
      const found = findDuplicates(def.id, data[def.id])
      dismissed.forEach((id) => found.delete(id))
      out[def.id] = found
    }
    return out
  }, [data, dismissed])

  /**
   * Adds parsed entries. Existing entries are kept. The single Contact entry only has blank fields filled;
   * where it already has a different value, that is recorded as a conflict to ask about.
   */
  const applyImport = (parsed: ParsedResume, replace: boolean) => {
    const counts: string[] = []
    const duplicates: string[] = []
    const conflicts: Record<string, string> = {}
    const next = { ...data }
    for (const def of SECTIONS) {
      const incoming = parsed[def.id]
      if (!incoming?.length) continue
      if (def.single) {
        const existing = data[def.id][0]
        // Replace starts from a blank Contact entry (keeping its id); otherwise existing values stay
        const merged: Entry = replace ? { ...blankEntry(def), id: existing.id } : { ...existing }
        let filled = 0
        for (const f of def.fields) {
          const v = incoming[0][f.key]?.trim()
          if (!v) continue
          const current = merged[f.key]?.trim()
          if (!current) {
            merged[f.key] = v
            filled++
          } else if (!similar(current, v) && current.toLowerCase() !== v.toLowerCase()) {
            conflicts[f.key] = v
          }
        }
        next[def.id] = [merged]
        if (filled) counts.push(`${def.nav}: ${filled} field${filled > 1 ? 's' : ''}`)
      } else {
        const added = incoming.map((row) => {
          const entry = blankEntry(def)
          def.fields.forEach((f) => { entry[f.key] = row[f.key] ?? '' })
          return entry
        })
        next[def.id] = replace ? added : [...data[def.id], ...added]
        counts.push(`${def.nav}: ${added.length}`)
        const addedIds = new Set(added.map((a) => a.id))
        const flagged = [...findDuplicates(def.id, next[def.id]).keys()].filter((id) => addedIds.has(id)).length
        if (flagged) duplicates.push(`${def.nav}: ${flagged}`)
      }
    }
    if (counts.length || Object.keys(conflicts).length) {
      setData(next)
      setProfileConflicts(conflicts)
      if (replace) setDismissed(new Set()) // old "not a duplicate" answers no longer apply
    }
    return { counts, duplicates, conflicts: Object.keys(conflicts).length }
  }

  const importResume = async (files: FileList | null) => {
    const file = files?.[0]
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    setImportError('')
    setImportNotice(null)

    // The real parser reads PDF, text and Markdown; the placeholder accepts more
    const allowed = DEV.useRealResumeParser ? ['pdf', 'txt', 'text', 'md', 'markdown'] : ['pdf', 'doc', 'docx', 'txt', 'rtf']
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!allowed.includes(ext)) {
      setImportError(
        DEV.useRealResumeParser
          ? 'That file type isn’t supported. Upload a PDF, text, or Markdown file. Word documents aren’t supported yet; save yours as a PDF first.'
          : 'That file type isn’t supported. Upload a PDF, Word document, or text file.',
      )
      return
    }
    if (file.size === 0) {
      setImportError('That file is empty.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError('That file is larger than 10 MB. Try a smaller version of your resume.')
      return
    }

    setImporting(true)
    try {
      const result = await parseResumeFile(file)
      const { counts, duplicates, conflicts } = applyImport(result.data, replaceExisting)
      if (counts.length === 0 && conflicts === 0) {
        setImportError('We couldn’t find any resume content in that file.')
      } else {
        setImportNotice({ file: file.name, counts, warnings: result.warnings, duplicates, conflicts, replaced: replaceExisting })
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Something went wrong while reading that resume.')
    } finally {
      setImporting(false)
    }
  }

  const addEntry = (def: SectionDef) =>
    setData((d) => ({ ...d, [def.id]: [...d[def.id], blankEntry(def)] }))

  const deleteEntry = (sectionId: SectionId, id: string) =>
    setData((d) => ({ ...d, [sectionId]: d[sectionId].filter((e) => e.id !== id) }))

  const updateEntry = (sectionId: SectionId, id: string, key: string, value: string) => {
    if (sectionId === 'profile' && profileConflicts[key] !== undefined) {
      setProfileConflicts((c) => withoutKey(c, key))
    }
    setData((d) => ({
      ...d,
      [sectionId]: d[sectionId].map((e) => (e.id === id ? { ...e, [key]: value } : e)),
    }))
  }

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
        <div className="import-box">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.rtf"
            hidden
            onChange={(e) => importResume(e.target.files)}
          />
          <button className="btn btn-primary import-btn" disabled={importing} onClick={() => fileInput.current?.click()}>
            {importing ? <><span className="spinner small" aria-hidden="true" /> Reading resume…</> : 'Upload existing resume'}
          </button>
          <p className="import-hint">
            {DEV.useRealResumeParser ? 'PDF, text or Markdown.' : 'PDF, Word or text.'} We’ll fill in the sections below for you to review.
          </p>
          <label className="import-replace">
            <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
            <span>Replace what’s already here instead of adding to it</span>
          </label>
        </div>
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
                {dupes[s.id].size > 0 && (
                  <span
                    className="nav-badge dup"
                    title={`${dupes[s.id].size} possible duplicate${dupes[s.id].size > 1 ? 's' : ''}`}
                  >
                    {dupes[s.id].size}
                  </span>
                )}
                {issues > 0 && (
                  <span className="nav-badge warn" title={`${issues} field${issues > 1 ? 's' : ''} need attention`}>{issues}</span>
                )}
              </button>
            )
          })}
          <button
            className={`data-nav-item ${activeSection === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveSection('templates')}
          >
            <span className="nav-label">Templates</span>
          </button>
          <button
            className={`data-nav-item ${activeSection === 'photos' ? 'active' : ''}`}
            onClick={() => setActiveSection('photos')}
          >
            <span className="nav-label">Photos</span>
          </button>
        </nav>
      </aside>

      <div className="data-main">
      {importError && (
        <div className="error-message import-message" role="alert">
          {importError}
          <button className="notice-close" onClick={() => setImportError('')} aria-label="Dismiss">✕</button>
        </div>
      )}
      {importNotice && (
        <div className="import-notice" role="status">
          <div className="import-notice-head">
            <strong>Imported from {importNotice.file}</strong>
            <button className="notice-close" onClick={() => setImportNotice(null)} aria-label="Dismiss">✕</button>
          </div>
          <ul className="import-counts">
            {importNotice.counts.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <p>
            Look through each section and fix anything that isn’t right. Whatever is here can go on a resume.{' '}
            {importNotice.replaced ? 'These replaced what the Data Bank held before.' : 'Imported entries were added to what you already had.'}
          </p>
          {(importNotice.warnings.length > 0 || importNotice.duplicates.length > 0 || importNotice.conflicts > 0) && (
            <ul className="import-warnings">
              {importNotice.duplicates.length > 0 && (
                <li>
                  Possible duplicates of things you already had (look for the yellow entries): {importNotice.duplicates.join(', ')}.
                </li>
              )}
              {importNotice.conflicts > 0 && (
                <li>
                  {importNotice.conflicts === 1
                    ? '1 contact field in your resume differs from what you had.'
                    : `${importNotice.conflicts} contact fields in your resume differ from what you had.`}{' '}
                  Yellow notes under them let you pick.
                </li>
              )}
              {importNotice.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      )}
      {activeSection === 'photos' ? (
        <PhotoBank photos={photos} onChange={onPhotosChange} />
      ) : activeSection === 'templates' ? (
        <TemplateSetup
          templates={templates}
          activeId={activeTemplateId}
          onSave={(template) => {
            const next = [...templates, template]
            setTemplates(next)
            saveCustomTemplates(next)
          }}
          onActivate={(id) => { setActiveTemplateId(id); saveActiveTemplateId(id) }}
        />
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
          {data[section.id].map((entry, i) => {
            const dup = dupes[section.id].get(entry.id)
            const original = dup ? data[section.id].findIndex((e) => e.id === dup.of) : -1
            return (
            <div key={entry.id} className={`entry-card${dup ? ' has-dup' : ''}`}>
              {dup && (
                <div className="dup-banner" role="note">
                  <span>
                    <strong>Possible duplicate</strong> of “{section.entryLabel?.(data[section.id][original], original) || 'an earlier entry'}”.
                    The highlighted fields look the same.
                  </span>
                  <span className="dup-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setDismissed((d) => new Set(d).add(entry.id))}>
                      Keep both
                    </button>
                    <button type="button" className="btn btn-secondary danger" onClick={() => deleteEntry(section.id, entry.id)}>
                      Delete this one
                    </button>
                  </span>
                </div>
              )}
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
                      warn={!!dup?.fields.includes(f.key)}
                      warning={
                        section.single && profileConflicts[f.key] !== undefined ? (
                          <>
                            <span>Your resume says “{profileConflicts[f.key]}”.</span>
                            <span className="dup-actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => updateEntry(section.id, entry.id, f.key, profileConflicts[f.key])}
                              >
                                Use that
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setProfileConflicts((c) => withoutKey(c, f.key))}
                              >
                                Keep mine
                              </button>
                            </span>
                          </>
                        ) : undefined
                      }
                      onChange={(v) => updateEntry(section.id, entry.id, f.key, v)}
                    />
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
      </section>
      )}
      </div>
    </div>
  )
}
