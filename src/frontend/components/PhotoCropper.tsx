import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { cropRect, cropWidthLimits, photoFromRect, SHAPE_ASPECT, SHAPE_RADIUS } from '../lib/photo'
import type { CropRect } from '../lib/photo'
import type { ResumePhoto } from '../types'
import '../styles/PhotoCropper.css'

interface PhotoCropperProps {
  photo: ResumePhoto
  onChange: (patch: Pick<ResumePhoto, 'zoom' | 'fx' | 'fy'>) => void
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'
/** Direction the crop box extends from the fixed (opposite) corner */
const DIR: Record<Corner, { sx: 1 | -1; sy: 1 | -1 }> = {
  nw: { sx: -1, sy: -1 },
  ne: { sx: 1, sy: -1 },
  sw: { sx: -1, sy: 1 },
  se: { sx: 1, sy: 1 },
}

const STAGE_MAX_W = 340
const STAGE_MAX_H = 280
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Shows the whole photo with a crop box over it. Drag inside the box to move it;
 * drag a corner anchor to resize it (the box keeps the shape's proportions).
 */
export default function PhotoCropper({ photo, onChange }: PhotoCropperProps) {
  const a = SHAPE_ASPECT[photo.shape]
  const ds = Math.min(STAGE_MAX_W / photo.w, STAGE_MAX_H / photo.h) // display px per source px
  const rect = cropRect(photo)
  const limits = cropWidthLimits(photo)
  const radius = photo.shape === 'circle' ? '50%' : `${SHAPE_RADIUS[photo.shape] * rect.w * ds}px`

  const emit = (r: CropRect) => onChange(photoFromRect(photo, r))

  const moveTo = (r: CropRect, x: number, y: number): CropRect => ({
    ...r,
    x: clamp(x, 0, photo.w - r.w),
    y: clamp(y, 0, photo.h - r.h),
  })

  // Pointer position in source-image pixels
  const toSource = (e: { clientX: number; clientY: number }, stage: HTMLElement) => {
    const b = stage.getBoundingClientRect()
    return { x: (e.clientX - b.left) / ds, y: (e.clientY - b.top) / ds }
  }

  const startMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const stage = e.currentTarget.parentElement as HTMLElement
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const start = toSource(e, stage)
    const origin = rect
    const move = (ev: PointerEvent) => {
      const p = toSource(ev, stage)
      emit(moveTo(origin, origin.x + p.x - start.x, origin.y + p.y - start.y))
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

  const startResize = (corner: Corner) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const stage = e.currentTarget.parentElement!.parentElement as HTMLElement
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const { sx, sy } = DIR[corner]
    // The opposite corner stays where it is
    const ax = sx > 0 ? rect.x : rect.x + rect.w
    const ay = sy > 0 ? rect.y : rect.y + rect.h
    const room = Math.min(sx > 0 ? photo.w - ax : ax, a * (sy > 0 ? photo.h - ay : ay))
    const maxW = Math.min(limits.max, room)
    const move = (ev: PointerEvent) => {
      const p = toSource(ev, stage)
      const w = clamp(Math.max(sx * (p.x - ax), a * sy * (p.y - ay)), Math.min(limits.min, maxW), maxW)
      const h = w / a
      emit({ x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h })
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

  // Keyboard: arrows move the box, +/- resize it around its center
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = rect.w * 0.05
    const k = e.key
    if (k === 'ArrowLeft') emit(moveTo(rect, rect.x - step, rect.y))
    else if (k === 'ArrowRight') emit(moveTo(rect, rect.x + step, rect.y))
    else if (k === 'ArrowUp') emit(moveTo(rect, rect.x, rect.y - step))
    else if (k === 'ArrowDown') emit(moveTo(rect, rect.x, rect.y + step))
    else if (k === '+' || k === '=' || k === '-' || k === '_') {
      const w = clamp(rect.w * (k === '-' || k === '_' ? 1.1 : 0.9), limits.min, limits.max)
      const cx = rect.x + rect.w / 2
      const cy = rect.y + rect.h / 2
      const h = w / a
      emit(moveTo({ x: 0, y: 0, w, h }, cx - w / 2, cy - h / 2))
    } else return
    e.preventDefault()
  }

  return (
    <div className="crop-stage" style={{ width: photo.w * ds, height: photo.h * ds }}>
      <img src={photo.src} alt="" draggable={false} />
      <div
        className="crop-box"
        style={{
          left: rect.x * ds,
          top: rect.y * ds,
          width: rect.w * ds,
          height: rect.h * ds,
          borderRadius: radius,
        }}
        tabIndex={0}
        role="group"
        aria-label="Crop area. Drag to move, drag a corner to resize. Arrow keys move, plus and minus resize."
        onPointerDown={startMove}
        onKeyDown={onKey}
      >
        {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
          <button
            key={c}
            type="button"
            tabIndex={-1}
            aria-label={`Resize from ${c.toUpperCase()} corner`}
            className={`crop-anchor ${c}`}
            onPointerDown={startResize(c)}
          />
        ))}
      </div>
    </div>
  )
}
