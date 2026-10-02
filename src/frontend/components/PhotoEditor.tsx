import { newResumePhoto, panBy, SHAPE_ASPECT } from '../lib/photo'
import PhotoFrame from './PhotoFrame'
import type {
  BankPhoto, LayoutId, PhotoAdvice, PhotoPlacement, PhotoShape, PhotoSize, ResumePhoto,
} from '../types'
import '../styles/PhotoEditor.css'

interface PhotoEditorProps {
  photo: ResumePhoto | null | undefined
  bank: BankPhoto[]
  advice?: PhotoAdvice
  layout: LayoutId
  accent: string
  onChange: (photo: ResumePhoto | null) => void
}

const PLACEMENTS: Array<{ id: PhotoPlacement; label: string; title: string }> = [
  { id: 'left', label: 'Left', title: 'Beside the name, on the left' },
  { id: 'right', label: 'Right', title: 'Beside the name, on the right' },
  { id: 'top', label: 'Top', title: 'Above the name (top of the side panel in the Sidebar layout)' },
]
const SHAPES: Array<{ id: PhotoShape; label: string }> = [
  { id: 'circle', label: 'Circle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
  { id: 'portrait', label: 'Portrait' },
]
const SIZES: Array<{ id: PhotoSize; label: string }> = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
]

export default function PhotoEditor({ photo, bank, advice, layout, accent, onChange }: PhotoEditorProps) {
  const patch = (p: Partial<ResumePhoto>) => photo && onChange({ ...photo, ...p })

  const toggle = (on: boolean) => {
    if (!on) return onChange(null)
    if (bank[0]) onChange(newResumePhoto(bank[0], layout))
  }

  return (
    <div className="photo-editor">
      {advice && (
        <div className={`photo-advice ${advice.recommended ? 'yes' : 'no'}`} role="note">
          <strong>{advice.recommended ? 'Recommended for this job' : 'Not recommended for this job'}</strong>
          <span>{advice.reason}</span>
        </div>
      )}

      <label className="switch-row">
        <input
          type="checkbox"
          checked={!!photo}
          disabled={bank.length === 0}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>Include a photo on this resume</span>
      </label>

      {bank.length === 0 && (
        <p className="photo-empty">
          No photos yet. Add some in the Data Bank tab under Photos, then come back to place one here.
        </p>
      )}

      {photo && (
        <>
          <div className="photo-group">
            <span className="picker-label">Photo</span>
            <div className="bank-choices" role="radiogroup" aria-label="Choose a photo">
              {bank.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={photo.photoId === b.id}
                  className={`bank-choice ${photo.photoId === b.id ? 'active' : ''}`}
                  title={b.name}
                  onClick={() => photo.photoId !== b.id && onChange(newResumePhoto(b, layout, photo))}
                >
                  <img src={b.src} alt={b.name} />
                </button>
              ))}
            </div>
          </div>

          <div className="photo-group">
            <span className="picker-label">Crop &amp; position</span>
            <div className="cropper">
              <PhotoFrame
                photo={photo}
                width={photo.shape === 'portrait' ? '120px' : '150px'}
                onPan={(dx, dy) => patch(panBy(photo, dx, dy))}
              />
              <div className="cropper-controls">
                <p className="field-hint">Drag the photo to reposition it inside the frame.</p>
                <label className="zoom-row">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={photo.zoom}
                    aria-label="Zoom"
                    onChange={(e) => patch({ zoom: Number(e.target.value) })}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => patch({ zoom: 1, fx: 0.5, fy: 0.5 })}
                >
                  Reset crop
                </button>
              </div>
            </div>
          </div>

          <div className="photo-group">
            <span className="picker-label">Placement</span>
            <div className="picker-chips" role="radiogroup" aria-label="Placement">
              {PLACEMENTS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={photo.placement === o.id}
                  title={o.title}
                  className={`chip ${photo.placement === o.id ? 'active' : ''}`}
                  onClick={() => patch({ placement: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="photo-group">
            <span className="picker-label">Shape</span>
            <div className="picker-chips" role="radiogroup" aria-label="Shape">
              {SHAPES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={photo.shape === o.id}
                  className={`chip ${photo.shape === o.id ? 'active' : ''}`}
                  onClick={() => patch({ shape: o.id })}
                >
                  <span
                    className="shape-icon"
                    style={{
                      aspectRatio: String(SHAPE_ASPECT[o.id]),
                      borderRadius: o.id === 'circle' ? '50%' : o.id === 'rounded' ? '30%' : o.id === 'portrait' ? '12%' : 0,
                    }}
                  />
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="photo-group">
            <span className="picker-label">Size</span>
            <div className="picker-chips" role="radiogroup" aria-label="Size">
              {SIZES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={photo.size === o.id}
                  className={`chip ${photo.size === o.id ? 'active' : ''}`}
                  onClick={() => patch({ size: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <label className="switch-row">
            <input type="checkbox" checked={photo.ring} onChange={(e) => patch({ ring: e.target.checked })} />
            <span>
              Outline in accent color <i className="ring-swatch" style={{ background: accent }} />
            </span>
          </label>
        </>
      )}
    </div>
  )
}
