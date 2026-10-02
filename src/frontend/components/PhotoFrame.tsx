import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { cropStyle, SHAPE_ASPECT, SHAPE_RADIUS } from '../lib/photo'
import type { ResumePhoto } from '../types'
import '../styles/PhotoFrame.css'

interface PhotoFrameProps {
  photo: ResumePhoto
  /** Frame width as a CSS length, e.g. "120px" or "calc(var(--pt) * 80)" */
  width: string
  ringColor?: string
  /** Called with the drag delta as a fraction of the frame size */
  onPan?: (dxFrac: number, dyFrac: number) => void
  className?: string
}

/** The cropped, shaped photo. The same geometry is used by the PDF (see lib/photo.ts). */
export default function PhotoFrame({ photo, width, ringColor, onPan, className = '' }: PhotoFrameProps) {
  const radius = photo.shape === 'circle' ? '50%' : `calc(var(--fw) * ${SHAPE_RADIUS[photo.shape]})`
  const style = {
    '--fw': width,
    width: 'var(--fw)',
    aspectRatio: String(SHAPE_ASPECT[photo.shape]),
    borderRadius: radius,
    '--ring': ringColor ?? 'currentColor',
  } as CSSProperties

  const handleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!onPan) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let lastX = e.clientX
    let lastY = e.clientY
    const move = (ev: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      onPan((ev.clientX - lastX) / rect.width, (ev.clientY - lastY) / rect.height)
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <div
      className={`photo-frame${onPan ? ' pannable' : ''} ${className}`}
      style={style}
      onPointerDown={handleDown}
    >
      <img src={photo.src} alt="" draggable={false} style={cropStyle(photo)} />
      {photo.ring && <span className="photo-ring" style={{ borderRadius: radius }} />}
    </div>
  )
}
