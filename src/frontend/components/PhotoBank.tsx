import { useRef, useState } from 'react'
import Field from './Field'
import { fileToBankPhoto } from '../lib/photo'
import type { BankPhoto } from '../types'
import '../styles/PhotoBank.css'

interface PhotoBankProps {
  photos: BankPhoto[]
  onChange: (photos: BankPhoto[]) => void
}

export default function PhotoBank({ photos, onChange }: PhotoBankProps) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError('')
    setBusy(true)
    const added: BankPhoto[] = []
    const rejected: string[] = []
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) {
        rejected.push(f.name)
        continue
      }
      try {
        added.push(await fileToBankPhoto(f))
      } catch {
        rejected.push(f.name)
      }
    }
    if (added.length) onChange([...photos, ...added])
    if (rejected.length) {
      setError(`Couldn’t use ${rejected.join(', ')}. Choose image files such as JPG or PNG.`)
    }
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  const rename = (id: string, name: string) => onChange(photos.map((p) => (p.id === id ? { ...p, name } : p)))

  return (
    <section className="data-content">
      <div className="section-title">
        <div>
          <h2>Photos</h2>
          <p className="section-blurb">
            Headshots you might use on a resume. Photos are optional and only included when you choose. Whether one
            helps depends on the job, and we’ll tell you when you tailor a resume.
          </p>
        </div>
        <div className="section-actions">
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => upload(e.target.files)}
          />
          <button className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Adding…' : '+ Add Photos'}
          </button>
        </div>
      </div>

      {error && <div className="error-message" role="alert">{error}</div>}

      {photos.length === 0 ? (
        <p className="empty-state">No photos yet. Add one or more headshots.</p>
      ) : (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.id} className="photo-card">
              <div className="photo-thumb">
                <img src={p.src} alt={p.name || 'Photo'} />
              </div>
              <Field
                id={`photo-${p.id}`}
                label="Name"
                value={p.name}
                required
                error={p.name.trim() ? '' : 'Name this photo so you can tell them apart.'}
                onChange={(v) => rename(p.id, v)}
              />
              <button
                className="btn btn-secondary danger"
                onClick={() => onChange(photos.filter((x) => x.id !== p.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
