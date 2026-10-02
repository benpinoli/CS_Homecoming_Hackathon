import { useState } from 'react'
import Field from './Field'
import ResumeDocument from './ResumeDocument'
import ResumeEditor from './ResumeEditor'
import { downloadResumePdf } from '../lib/resumePdf'
import type { BankPhoto, SavedResume } from '../types'
import '../styles/MyResumes.css'

interface MyResumesProps {
  resumes: SavedResume[]
  photoBank: BankPhoto[]
  onPhotoBankChange: (photos: BankPhoto[]) => void
  onUpdate: (id: string, patch: Partial<Omit<SavedResume, 'id'>>) => void
  onDelete: (id: string) => void
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export default function MyResumes({ resumes, photoBank, onPhotoBankChange, onUpdate, onDelete }: MyResumesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [draft, setDraft] = useState('')
  const [renameError, setRenameError] = useState('')

  const selected = resumes.find((r) => r.id === selectedId) ?? resumes[0]
  const editing = !!selected && editingId === selected.id

  const startRename = (r: SavedResume) => {
    setDeletingId(null)
    setRenamingId(r.id)
    setDraft(r.name)
    setRenameError('')
  }

  const commitRename = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) {
      setRenameError('A resume needs a name.')
      return
    }
    onUpdate(renamingId!, { name: draft.trim() })
    setRenamingId(null)
  }

  if (resumes.length === 0) {
    return (
      <div className="my-resumes-empty">
        <h2>No saved resumes</h2>
        <p>Generate a tailored resume in the Resume Matcher, then choose “Save to My Resumes”.</p>
      </div>
    )
  }

  const thumb = (r: SavedResume) => (
    <span className="row-thumb" aria-hidden="true">
      <ResumeDocument resume={r.resume} appearance={r.appearance} />
    </span>
  )

  return (
    <div className={`my-resumes${collapsed ? ' collapsed' : ''}`}>
      <aside className="resume-list" aria-label="Saved resumes">
        <div className="list-head">
          {!collapsed && (
            <h2>
              My Resumes <span className="list-count">{resumes.length}</span>
            </h2>
          )}
          <button
            className="collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand resume list' : 'Collapse resume list'}
            title={collapsed ? 'Expand list' : 'Collapse list'}
          >
            <span className="chevron" />
          </button>
        </div>

        {collapsed ? (
          <div className="rail">
            {resumes.map((r) => (
              <button
                key={r.id}
                className={`rail-item ${selected?.id === r.id ? 'active' : ''}`}
                title={r.name}
                aria-label={r.name}
                aria-pressed={selected?.id === r.id}
                onClick={() => setSelectedId(r.id)}
              >
                {thumb(r)}
              </button>
            ))}
          </div>
        ) : (
          <div className="resume-rows">
            {resumes.map((r) => {
              const active = selected?.id === r.id
              return (
                <div key={r.id} className={`resume-row ${active ? 'active' : ''}`}>
                  {renamingId === r.id ? (
                    <form onSubmit={commitRename} noValidate className="rename-form">
                      <Field
                        id={`rename-${r.id}`}
                        label="Name"
                        value={draft}
                        error={renameError}
                        onChange={(v) => { setDraft(v); if (renameError) setRenameError('') }}
                      />
                      <div className="card-actions">
                        <button type="submit" className="btn btn-primary">Save</button>
                        <button type="button" className="btn btn-secondary" onClick={() => setRenamingId(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button className="row-main" onClick={() => setSelectedId(r.id)} aria-current={active}>
                        {thumb(r)}
                        <span className="row-text">
                          <span className="card-name">{r.name}</span>
                          <span className="card-meta">Saved {formatDate(r.savedAt)}</span>
                        </span>
                      </button>
                      {active &&
                        (deletingId === r.id ? (
                          <div className="confirm-delete" role="alertdialog" aria-label={`Delete ${r.name}?`}>
                            <p>Delete this resume? This can’t be undone.</p>
                            <div className="card-actions">
                              <button
                                className="btn btn-danger"
                                onClick={() => {
                                  onDelete(r.id)
                                  setDeletingId(null)
                                }}
                              >
                                Delete
                              </button>
                              <button className="btn btn-secondary" onClick={() => setDeletingId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="card-actions">
                            <button className="btn btn-secondary" onClick={() => downloadResumePdf(r.resume, r.appearance, r.name)}>PDF</button>
                            <button className="btn btn-secondary" onClick={() => startRename(r)}>Rename</button>
                            <button className="btn btn-secondary danger" onClick={() => setDeletingId(r.id)}>Delete</button>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </aside>

      <section className="resume-view">
        {selected && (
          <>
            <div className="section-header">
              <div>
                <h2>{selected.name}</h2>
                {selected.jobUrl && <p className="card-meta">Tailored for {selected.jobUrl}</p>}
              </div>
            </div>
            <div className="action-bar">
              <button
                className="btn btn-secondary"
                onClick={() => setEditingId(editing ? null : selected.id)}
              >
                {editing ? 'Done Editing' : 'Edit'}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => downloadResumePdf(selected.resume, selected.appearance, selected.name)}
              >
                Download PDF
              </button>
            </div>
            <div className={`view-body${editing ? ' is-editing' : ''}`}>
              <div className="view-preview">
                <ResumeDocument resume={selected.resume} appearance={selected.appearance} />
              </div>
              {editing && (
                <ResumeEditor
                  key={selected.id}
                  resume={selected.resume}
                  onChange={(resume) => onUpdate(selected.id, { resume })}
                  appearance={selected.appearance}
                  onAppearanceChange={(appearance) => onUpdate(selected.id, { appearance })}
                  photoBank={photoBank}
                  onPhotoBankChange={onPhotoBankChange}
                  photoAdvice={selected.photoAdvice}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
