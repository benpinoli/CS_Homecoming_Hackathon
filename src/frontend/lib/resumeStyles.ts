import type { ColorId, FontId, LayoutId, ResumeAppearance } from '../types'
import interRegular from '../assets/fonts/Inter_400Regular.ttf?url'
import interBold from '../assets/fonts/Inter_700Bold.ttf?url'
import interItalic from '../assets/fonts/Inter_400Regular_Italic.ttf?url'
import latoRegular from '../assets/fonts/Lato_400Regular.ttf?url'
import latoBold from '../assets/fonts/Lato_700Bold.ttf?url'
import latoItalic from '../assets/fonts/Lato_400Regular_Italic.ttf?url'
import serifRegular from '../assets/fonts/SourceSerif4_400Regular.ttf?url'
import serifBold from '../assets/fonts/SourceSerif4_700Bold.ttf?url'
import serifItalic from '../assets/fonts/SourceSerif4_400Regular_Italic.ttf?url'
import plexRegular from '../assets/fonts/IBMPlexSans_400Regular.ttf?url'
import plexBold from '../assets/fonts/IBMPlexSans_700Bold.ttf?url'
import plexItalic from '../assets/fonts/IBMPlexSans_400Regular_Italic.ttf?url'

export interface FontDef {
  /** CSS family name (see styles/fonts.css) */
  family: string
  fallback: string
  files: { normal: string; bold: string; italic: string }
}

export const FONTS: Record<FontId, FontDef> = {
  serif: { family: 'Source Serif 4', fallback: 'Georgia, serif', files: { normal: serifRegular, bold: serifBold, italic: serifItalic } },
  lato: { family: 'Lato', fallback: 'Helvetica, Arial, sans-serif', files: { normal: latoRegular, bold: latoBold, italic: latoItalic } },
  inter: { family: 'Inter', fallback: 'Helvetica, Arial, sans-serif', files: { normal: interRegular, bold: interBold, italic: interItalic } },
  plex: { family: 'IBM Plex Sans', fallback: 'Helvetica, Arial, sans-serif', files: { normal: plexRegular, bold: plexBold, italic: plexItalic } },
}

export interface LayoutDef {
  id: LayoutId
  label: string
  blurb: string
  header: 'center' | 'left' | 'band'
  heading: 'rule' | 'accent-rule' | 'plain'
  columns: 'single' | 'sidebar'
}

export const LAYOUTS: LayoutDef[] = [
  { id: 'centered', label: 'Centered', blurb: 'Centered name, ruled sections', header: 'center', heading: 'rule', columns: 'single' },
  { id: 'left', label: 'Left', blurb: 'Name and contact on the left', header: 'left', heading: 'accent-rule', columns: 'single' },
  { id: 'banner', label: 'Banner', blurb: 'Full-width header band', header: 'band', heading: 'plain', columns: 'single' },
  { id: 'sidebar', label: 'Sidebar', blurb: 'Two columns with a side panel', header: 'left', heading: 'accent-rule', columns: 'sidebar' },
]

export interface FontOption {
  id: FontId
  label: string
}

export const FONT_OPTIONS: FontOption[] = [
  { id: 'serif', label: 'Serif' },
  { id: 'lato', label: 'Lato' },
  { id: 'inter', label: 'Inter' },
  { id: 'plex', label: 'Plex Sans' },
]

export interface ColorScheme {
  id: ColorId
  label: string
  accent: string
  ink: string
  muted: string
  /** Tint behind the sidebar column */
  tint: string
}

export const COLOR_SCHEMES: ColorScheme[] = [
  { id: 'navy', label: 'Navy', accent: '#1f3a5f', ink: '#111827', muted: '#4b5563', tint: '#e6ebf2' },
  { id: 'teal', label: 'Teal', accent: '#0f766e', ink: '#17211f', muted: '#52615f', tint: '#e2efed' },
  { id: 'charcoal', label: 'Charcoal', accent: '#2f343b', ink: '#16181c', muted: '#5a6069', tint: '#e8e9eb' },
  { id: 'burgundy', label: 'Burgundy', accent: '#7a1f2e', ink: '#201417', muted: '#6a5559', tint: '#f1e6e8' },
  { id: 'slate', label: 'Slate', accent: '#3b6aa8', ink: '#1c2533', muted: '#53627a', tint: '#e6edf6' },
]

/** Everything the preview and PDF renderers need, resolved from the three independent choices */
export interface ResumeStyle {
  font: FontId
  accent: string
  ink: string
  muted: string
  tint: string
  header: LayoutDef['header']
  heading: LayoutDef['heading']
  layout: LayoutDef['columns']
}

export const resolveStyle = ({ layout, font, color }: ResumeAppearance): ResumeStyle => {
  const l = LAYOUTS.find((x) => x.id === layout) ?? LAYOUTS[0]
  const c = COLOR_SCHEMES.find((x) => x.id === color) ?? COLOR_SCHEMES[0]
  return {
    font, accent: c.accent, ink: c.ink, muted: c.muted, tint: c.tint,
    header: l.header, heading: l.heading, layout: l.columns,
  }
}

export const fontStack = (key: FontId) => `'${FONTS[key].family}', ${FONTS[key].fallback}`

/** Page geometry shared by the preview and the PDF, in points (US Letter) */
export const PAGE = { w: 612, h: 792, margin: 54, sideW: 190 }
