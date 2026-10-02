import { COLOR_SCHEMES, FONT_OPTIONS, LAYOUTS, resolveStyle, fontStack } from '../lib/resumeStyles'
import type { ResumeAppearance } from '../types'
import '../styles/fonts.css'
import '../styles/StylePicker.css'

interface StylePickerProps {
  value: ResumeAppearance
  onChange: (value: ResumeAppearance) => void
}

/** Layout, font and color are chosen independently */
export default function StylePicker({ value, onChange }: StylePickerProps) {
  const accent = resolveStyle(value).accent
  const set = (patch: Partial<ResumeAppearance>) => onChange({ ...value, ...patch })

  return (
    <div className="style-picker">
      <div className="picker-group">
        <span className="picker-label">Layout</span>
        <div className="picker-layouts" role="radiogroup" aria-label="Layout">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={value.layout === l.id}
              title={l.blurb}
              className={`style-option ${value.layout === l.id ? 'active' : ''}`}
              onClick={() => set({ layout: l.id })}
            >
              <span className={`style-thumb thumb-${l.id}`} style={{ '--thumb-accent': accent } as React.CSSProperties} aria-hidden="true">
                <i /><i /><i />
              </span>
              <span className="style-name">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <span className="picker-label">Font</span>
        <div className="picker-chips" role="radiogroup" aria-label="Font">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={value.font === f.id}
              className={`chip ${value.font === f.id ? 'active' : ''}`}
              onClick={() => set({ font: f.id })}
            >
              <span className="chip-font" style={{ fontFamily: fontStack(f.id) }}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="picker-group">
        <span className="picker-label">Color</span>
        <div className="picker-colors" role="radiogroup" aria-label="Color">
          {COLOR_SCHEMES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={value.color === c.id}
              className={`chip chip-color ${value.color === c.id ? 'active' : ''}`}
              onClick={() => set({ color: c.id })}
            >
              <span className="chip-swatch" style={{ background: c.accent, boxShadow: `0 0 0 3px ${c.tint}` }} />
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
