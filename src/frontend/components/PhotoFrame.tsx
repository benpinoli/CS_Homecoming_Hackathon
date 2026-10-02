import type { CSSProperties } from 'react'
import { cropStyle, SHAPE_ASPECT, SHAPE_RADIUS } from '../lib/photo'
import type { ResumePhoto } from '../types'
import '../styles/PhotoFrame.css'

interface PhotoFrameProps {
  photo: ResumePhoto
  /** Frame width as a CSS length, e.g. "120px" or "calc(var(--pt) * 80)" */
  width: string
  ringColor?: string
  className?: string
}

/** The cropped, shaped photo. The same geometry is used by the PDF (see lib/photo.ts). */
export default function PhotoFrame({ photo, width, ringColor, className = '' }: PhotoFrameProps) {
  const radius = photo.shape === 'circle' ? '50%' : `calc(var(--fw) * ${SHAPE_RADIUS[photo.shape]})`
  const style = {
    '--fw': width,
    width: 'var(--fw)',
    aspectRatio: String(SHAPE_ASPECT[photo.shape]),
    borderRadius: radius,
    '--ring': ringColor ?? 'currentColor',
  } as CSSProperties

  return (
    <div className={`photo-frame ${className}`} style={style}>
      <img src={photo.src} alt="" draggable={false} style={cropStyle(photo)} />
      {photo.ring && <span className="photo-ring" style={{ borderRadius: radius }} />}
    </div>
  )
}
