import type { BankPhoto, LayoutId, PhotoPlacement, PhotoShape, PhotoSize, ResumePhoto } from '../types'

export const SHAPE_ASPECT: Record<PhotoShape, number> = { circle: 1, rounded: 1, square: 1, portrait: 3 / 4 }

/** Corner radius as a fraction of the frame width (circle is handled as a full ellipse) */
export const SHAPE_RADIUS: Record<PhotoShape, number> = { circle: 0.5, rounded: 0.16, square: 0, portrait: 0.05 }

/** Frame width in resume points */
export const SIZE_PT: Record<PhotoSize, number> = { sm: 60, md: 80, lg: 104 }

export const SIDEBAR_INNER_W = 142

export const effectivePlacement = (p: ResumePhoto, layout: LayoutId): PhotoPlacement =>
  layout === 'banner' && p.placement === 'top' ? 'left' : p.placement

/** The accent color would vanish against the Banner's solid accent band, so the outline turns white there */
export const photoRingColor = (layout: LayoutId, accent: string) => (layout === 'banner' ? '#ffffff' : accent)

/**
 * Placements that make sense for a layout. Internally 'top' means "above the name", or the top of the
 * side panel in the Sidebar layout; the Banner has no separate "above" because it would equal "left".
 */
export function placementOptions(layout: LayoutId): Array<{ value: PhotoPlacement; label: string }> {
  switch (layout) {
    case 'banner':
      return [
        { value: 'left', label: 'Banner, left' },
        { value: 'right', label: 'Banner, right' },
      ]
    case 'sidebar':
      return [
        { value: 'top', label: 'Side panel' },
        { value: 'left', label: 'Left of name' },
        { value: 'right', label: 'Right of name' },
      ]
    default:
      return [
        { value: 'left', label: 'Left of name' },
        { value: 'right', label: 'Right of name' },
        { value: 'top', label: 'Above name' },
      ]
  }
}

export const photoWidthPt = (p: ResumePhoto, layout: LayoutId) => {
  const w = SIZE_PT[p.size]
  return layout === 'sidebar' && effectivePlacement(p, layout) === 'top' ? Math.min(w, SIDEBAR_INNER_W) : w
}

export const photoHeightPt = (p: ResumePhoto, layout: LayoutId) =>
  photoWidthPt(p, layout) / SHAPE_ASPECT[p.shape]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Which part of the image is visible. Everything is in source-image pixels, so the preview
 * (CSS percentages) and the PDF (canvas crop) show exactly the same region.
 */
export function cropView(p: Pick<ResumePhoto, 'w' | 'h' | 'zoom' | 'fx' | 'fy' | 'shape'>) {
  const a = SHAPE_ASPECT[p.shape]
  const scale = Math.max(a / p.w, 1 / p.h) * Math.max(1, p.zoom)
  const vw = a / scale
  const vh = 1 / scale
  const cx = clamp(p.fx * p.w, vw / 2, p.w - vw / 2)
  const cy = clamp(p.fy * p.h, vh / 2, p.h - vh / 2)
  return { vw, vh, cx, cy }
}

/** Absolute-position percentages for an <img> inside the frame */
export function cropStyle(p: Parameters<typeof cropView>[0]) {
  const { vw, vh, cx, cy } = cropView(p)
  return {
    width: `${(p.w / vw) * 100}%`,
    height: `${(p.h / vh) * 100}%`,
    left: `${50 - (cx / vw) * 100}%`,
    top: `${50 - (cy / vh) * 100}%`,
  }
}

export interface CropRect { x: number; y: number; w: number; h: number }

/** The visible region as a rectangle in source-image pixels */
export function cropRect(p: Parameters<typeof cropView>[0]): CropRect {
  const { vw, vh, cx, cy } = cropView(p)
  return { x: cx - vw / 2, y: cy - vh / 2, w: vw, h: vh }
}

/** Zoom range expressed as the crop rectangle's width in source pixels */
export function cropWidthLimits(p: Pick<ResumePhoto, 'w' | 'h' | 'shape'>) {
  const a = SHAPE_ASPECT[p.shape]
  const base = Math.max(a / p.w, 1 / p.h)
  return { max: a / base, min: a / (base * MAX_ZOOM) }
}

export const MAX_ZOOM = 5

/** Convert a crop rectangle back into the stored zoom and focus */
export function photoFromRect(p: Pick<ResumePhoto, 'w' | 'h' | 'shape'>, r: CropRect): Pick<ResumePhoto, 'zoom' | 'fx' | 'fy'> {
  const a = SHAPE_ASPECT[p.shape]
  const base = Math.max(a / p.w, 1 / p.h)
  return {
    zoom: Math.min(MAX_ZOOM, Math.max(1, a / (r.w * base))),
    fx: (r.x + r.w / 2) / p.w,
    fy: (r.y + r.h / 2) / p.h,
  }
}

export const defaultPlacement = (layout: LayoutId): PhotoPlacement => (layout === 'sidebar' ? 'top' : 'right')

export const newResumePhoto = (bank: BankPhoto, layout: LayoutId, prev?: ResumePhoto | null): ResumePhoto => ({
  photoId: bank.id,
  src: bank.src,
  w: bank.w,
  h: bank.h,
  zoom: 1,
  fx: 0.5,
  fy: 0.5,
  shape: prev?.shape ?? 'circle',
  placement: prev?.placement ?? defaultPlacement(layout),
  size: prev?.size ?? 'md',
  ring: prev?.ring ?? false,
})

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = src
  })

/** Downscale an uploaded file so it stays small enough to store */
export async function fileToBankPhoto(file: File, maxSide = 900): Promise<BankPhoto> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read file'))
    r.readAsDataURL(file)
  })
  const img = await loadImage(dataUrl)
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * k)
  const h = Math.round(img.naturalHeight * k)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    name: file.name.replace(/\.[^.]+$/, ''),
    src: canvas.toDataURL('image/jpeg', 0.85),
    w,
    h,
  }
}

/** Renders the cropped, shaped photo (with optional ring) as a PNG for the PDF */
export async function renderPhotoPng(p: ResumePhoto, ringHex: string, widthPt: number): Promise<string> {
  const img = await loadImage(p.src)
  const a = SHAPE_ASPECT[p.shape]
  const outW = Math.round(widthPt * 5)
  const outH = Math.round(outW / a)
  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')!

  const path = (inset: number) => {
    const r = Math.max(0, SHAPE_RADIUS[p.shape] * outW - inset)
    ctx.beginPath()
    if (p.shape === 'circle') ctx.ellipse(outW / 2, outH / 2, outW / 2 - inset, outH / 2 - inset, 0, 0, Math.PI * 2)
    else ctx.roundRect(inset, inset, outW - inset * 2, outH - inset * 2, r)
  }

  path(0)
  ctx.clip()
  const { vw, vh, cx, cy } = cropView(p)
  ctx.drawImage(img, cx - vw / 2, cy - vh / 2, vw, vh, 0, 0, outW, outH)
  if (p.ring) {
    ctx.strokeStyle = ringHex
    // Half the stroke is clipped away, leaving a ring 2.5% of the width thick inside the edge (as in the preview)
    ctx.lineWidth = outW * 0.025 * 2
    path(0)
    ctx.stroke()
  }
  return canvas.toDataURL('image/png')
}
