import { useRef, useState } from 'react'
import type { BlockRole, ResumeTemplate, TemplateBlock } from '../lib/docxTemplate'
import { paragraphsFromDocx, proposeTemplateBlocks } from '../lib/docxTemplate'

const ROLES: BlockRole[] = ['contact', 'heading', 'experience', 'project', 'bullet', 'example', 'other']

interface TemplateSetupProps {
  templates: ResumeTemplate[]
  activeId: string
  onSave: (template: ResumeTemplate) => void
  onActivate: (id: string) => void
}

export default function TemplateSetup({ templates, activeId, onSave, onActivate }: TemplateSetupProps) {
  const input = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<TemplateBlock[] | null>(null)
  const [draftName, setDraftName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const choose = async (files: FileList | null) => {
    const file = files?.[0]
    if (input.current) input.current.value = ''
    if (!file) return
    setError('')
    setNote('')
    setDraft(null)
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      setNote(`${file.name} is kept as a visual reference only. Pick a built-in template to generate from. PDF text positions are not an editable layout.`)
      return
    }
    if (ext !== 'docx') {
      setError('Upload a simple DOCX to map, or a PDF/image to use as a visual reference.')
      return
    }
    try {
      const paragraphs = await paragraphsFromDocx(file)
      setDraft(proposeTemplateBlocks(paragraphs))
      setDraftName(file.name.replace(/\.docx$/i, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that document.')
    }
  }

  const approve = () => {
    if (!draft) return
    const template: ResumeTemplate = {
      id: `docx_${Date.now()}`,
      name: draftName || 'Uploaded template',
      kind: 'docx',
      version: 1,
      pageLimit: 1,
      approved: true,
      blocks: draft,
    }
    onSave(template)
    onActivate(template.id)
    setDraft(null)
  }

  return (
    <section className="data-content">
      <div className="section-title">
        <div>
          <h2>Templates</h2>
          <p className="section-blurb">
            Built-in templates generate immediately. A simple DOCX is mapped once, previewed, and then reused.
            Sentences in the file are examples, not your facts.
          </p>
        </div>
      </div>
      <input ref={input} type="file" accept=".docx,.pdf,.png,.jpg,.jpeg" hidden onChange={(e) => choose(e.target.files)} />
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>Upload template</button>
      {error && <p className="error-message">{error}</p>}
      {note && <p className="section-blurb">{note}</p>}
      <div className="entry-list">
        {templates.map((template) => (
          <div key={template.id} className="entry-card">
            <div className="entry-head">
              <span className="entry-title">{template.name} · {template.kind} · v{template.version}</span>
              <button type="button" className="btn btn-secondary" onClick={() => onActivate(template.id)} disabled={!template.approved}>
                {activeId === template.id ? 'Active' : 'Use'}
              </button>
            </div>
            {template.referenceNote && <p>{template.referenceNote}</p>}
          </div>
        ))}
      </div>
      {draft && (
        <div className="entry-list">
          <h3>Map this template</h3>
          <p className="section-blurb">Correct any block, then approve. Example content will not be saved as your experience.</p>
          {draft.map((block) => (
            <div key={block.id} className="entry-card">
              <label>
                <select
                  value={block.role}
                  onChange={(event) =>
                    setDraft(draft.map((item) => (item.id === block.id ? { ...item, role: event.target.value as BlockRole } : item)))
                  }
                >
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              </label>
              <p>{block.text}</p>
            </div>
          ))}
          <button type="button" className="btn btn-primary" onClick={approve}>Approve and reuse</button>
        </div>
      )}
    </section>
  )
}
