import type { FontId, GeneratedResume, ResumeAppearance } from '../types'
import { FONTS, PAGE, resolveStyle } from './resumeStyles'
import { effectivePlacement, photoHeightPt, photoRingColor, photoWidthPt, renderPhotoPng } from './photo'

const BODY = 10
const LEADING = 1.3
const SIDE_PAD = 24
const MAIN_PAD_L = 28
const MAIN_PAD_R = 40
const SIDE_TOP = 44

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const fontCache = new Map<string, Promise<string>>()
const loadFont = (url: string) => {
  if (!fontCache.has(url)) {
    fontCache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Could not load font: ${url}`)
        return r.arrayBuffer()
      }).then(toBase64),
    )
  }
  return fontCache.get(url)!
}

/** Embeds the regular, bold and italic files of a font so the PDF matches the preview exactly */
async function embedFont(doc: import('jspdf').jsPDF, key: FontId) {
  const def = FONTS[key]
  const styles = ['normal', 'bold', 'italic'] as const
  const data = await Promise.all(styles.map((s) => loadFont(def.files[s])))
  styles.forEach((s, i) => {
    const file = `${key}-${s}.ttf`
    doc.addFileToVFS(file, data[i])
    doc.addFont(file, def.family, s, undefined, 'Identity-H')
  })
  return def.family
}

interface Col {
  x: number
  w: number
  y: number
  top: number
  page: number
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

/** Builds a text-based (ATS-parseable) letter-size PDF in the chosen style and triggers a download. */
export async function downloadResumePdf(resume: GeneratedResume, appearance: ResumeAppearance, fileName: string) {
  // Loaded on demand so the PDF library stays out of the main bundle
  const { jsPDF } = await import('jspdf')
  const st = resolveStyle(appearance)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const family = await embedFont(doc, st.font)
  const { w: PW, h: PH, margin: MARGIN, sideW: SIDE_W } = PAGE
  const sidebar = st.layout === 'sidebar'

  const text = (hex: string) => doc.setTextColor(...rgb(hex))
  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', hex = st.ink) => {
    doc.setFont(family, style)
    doc.setFontSize(size)
    text(hex)
  }
  const lineH = (size: number) => size * LEADING

  const drawPageBg = () => {
    if (!sidebar) return
    doc.setFillColor(...rgb(st.tint))
    doc.rect(0, 0, SIDE_W, PH, 'F')
  }
  drawPageBg()

  // Photo (cropped and shaped to a PNG so the PDF matches the preview)
  const photo = resume.photo ?? null
  const place = photo ? effectivePlacement(photo, appearance.layout) : null
  const pw = photo ? photoWidthPt(photo, appearance.layout) : 0
  const ph = photo ? photoHeightPt(photo, appearance.layout) : 0
  const photoPng = photo ? await renderPhotoPng(photo, photoRingColor(appearance.layout, st.accent), pw) : null
  const drawPhoto = (x: number, y: number) => {
    if (photoPng) doc.addImage(photoPng, 'PNG', x, y, pw, ph)
  }
  const GAP = 16

  let c: Col = { x: MARGIN, w: PW - MARGIN * 2, y: MARGIN, top: MARGIN, page: 1 }

  const nextPage = () => {
    c.page += 1
    if (c.page > doc.getNumberOfPages()) {
      doc.addPage()
      drawPageBg()
    }
    doc.setPage(c.page)
    c.y = c.top
  }
  const ensure = (h: number) => {
    if (c.y + h > PH - MARGIN) nextPage()
  }

  const paragraph = (
    str: string,
    { size = BODY, style = 'normal', indent = 0, hex = st.ink, gap = 0 }: {
      size?: number; style?: 'normal' | 'italic' | 'bold'; indent?: number; hex?: string; gap?: number
    } = {},
  ) => {
    setFont(size, style, hex)
    const wrapped: string[] = doc.splitTextToSize(str, c.w - indent)
    wrapped.forEach((line) => {
      ensure(lineH(size))
      c.y += lineH(size)
      doc.text(line, c.x + indent, c.y - size * 0.25)
    })
    c.y += gap
  }

  const row = (left: string, right: string) => {
    ensure(lineH(BODY) * 2)
    c.y += lineH(BODY)
    setFont(BODY, 'normal', st.muted)
    const rightW = right ? doc.getTextWidth(right) : 0
    setFont(BODY, 'bold')
    const leftLines: string[] = doc.splitTextToSize(left, c.w - rightW - 12)
    doc.text(leftLines[0] ?? '', c.x, c.y - BODY * 0.25)
    if (right) {
      setFont(BODY, 'normal', st.muted)
      doc.text(right, c.x + c.w, c.y - BODY * 0.25, { align: 'right' })
    }
  }

  const bullets = (items: string[]) =>
    items.filter((b) => b.trim()).forEach((b) => {
      ensure(lineH(BODY))
      const start = c.y
      paragraph(b, { indent: 14 })
      setFont(BODY)
      doc.text('•', c.x + 4, start + lineH(BODY) - BODY * 0.25)
    })

  const heading = (title: string) => {
    ensure(36)
    if (c.y > c.top) c.y += 12
    c.y += lineH(10.5)
    setFont(10.5, 'bold', st.accent)
    doc.text(title.toUpperCase(), c.x, c.y - 3, { charSpace: st.heading === 'plain' ? 1.4 : 1 })
    if (st.heading !== 'plain') {
      doc.setDrawColor(...rgb(st.heading === 'rule' ? st.ink : st.accent))
      doc.setLineWidth(st.heading === 'rule' ? 0.6 : 1)
      doc.line(c.x, c.y, c.x + c.w, c.y)
    }
    c.y += 4
  }

  const contact = [resume.email, resume.phone, resume.location, ...resume.links].filter(Boolean)
  const contactLine = contact.join('  |  ')

  // ---------- Header ----------
  const sidebarTop = sidebar && place === 'top'
  const nameFor = (s: string) => (st.header === 'left' ? s : s.toUpperCase())

  const header = () => {
    // Text region, narrowed when a photo sits beside the name
    const beside = !!photo && !sidebarTop && (place === 'left' || place === 'right')
    let x0 = c.x
    let x1 = c.x + c.w
    if (beside && place === 'left') x0 += pw + GAP
    if (beside && place === 'right') x1 -= pw + GAP
    const rw = x1 - x0
    const midX = (x0 + x1) / 2
    const photoX = place === 'left' ? c.x : x1 + GAP

    if (st.header === 'band') {
      // filled strip across the top of the first page; the photo sits inside it
      setFont(9, 'normal', '#e8ecf2')
      const cl: string[] = doc.splitTextToSize(contactLine, rw)
      const textH = 26 + 4 + cl.length * lineH(9)
      const bandH = 30 + Math.max(textH, beside ? ph : 0) + 18
      doc.setFillColor(...rgb(st.accent))
      doc.rect(0, 0, PW, bandH, 'F')
      if (beside) drawPhoto(photoX, 30)
      setFont(22, 'bold', '#ffffff')
      doc.text(nameFor(resume.name), x0, 30 + 22, { charSpace: 1 })
      setFont(9, 'normal', '#e8ecf2')
      let y = 30 + 26 + 4
      cl.forEach((l) => {
        y += lineH(9)
        doc.text(l, x0, y)
      })
      c.y = bandH + 2
      return
    }

    if (photo && place === 'top' && !sidebarTop) {
      drawPhoto(st.header === 'center' ? PW / 2 - pw / 2 : c.x, c.y)
      c.y += ph + 8
    }
    const textTop = c.y

    if (st.header === 'center') {
      c.y += 20
      setFont(20, 'bold')
      doc.text(nameFor(resume.name), midX, c.y, { align: 'center', charSpace: 1 })
      c.y += 4
      setFont(9, 'normal', st.muted)
      ;(doc.splitTextToSize(contactLine, rw) as string[]).forEach((l) => {
        c.y += lineH(9)
        doc.text(l, midX, c.y, { align: 'center' })
      })
      if (beside) {
        drawPhoto(photoX, textTop)
        c.y = Math.max(c.y, textTop + ph)
      }
    } else {
      setFont(22, 'bold', st.accent)
      c.y += 22
      ;(doc.splitTextToSize(resume.name, rw) as string[]).forEach((l, i) => {
        if (i > 0) c.y += lineH(22)
        doc.text(l, x0, c.y)
      })
      if (!sidebar) {
        c.y += 4
        setFont(9, 'normal', st.muted)
        ;(doc.splitTextToSize(contactLine, rw) as string[]).forEach((l) => {
          c.y += lineH(9)
          doc.text(l, x0, c.y)
        })
      }
      if (beside) {
        drawPhoto(photoX, textTop)
        c.y = Math.max(c.y, textTop + ph)
      }
      if (!sidebar) {
        c.y += 6
        doc.setDrawColor(...rgb(st.accent))
        doc.setLineWidth(2)
        doc.line(c.x, c.y, c.x + c.w, c.y)
      }
    }
  }

  // ---------- Sections ----------
  const summary = () => {
    if (!resume.summary.trim()) return
    heading('Summary')
    paragraph(resume.summary)
  }

  const experience = () => {
    if (!resume.experience.length) return
    heading('Experience')
    resume.experience.forEach((e) => {
      ensure(lineH(BODY) * 3)
      row(e.position, e.duration)
      paragraph([e.company, e.location].filter(Boolean).join(', '), { style: 'italic', hex: st.muted })
      bullets(e.bullets)
      c.y += 5
    })
  }

  const projects = () => {
    if (!resume.projects.length) return
    heading('Projects')
    resume.projects.forEach((p) => {
      ensure(lineH(BODY) * 3)
      row(p.name, p.link)
      paragraph(p.technologies, { style: 'italic', hex: st.muted })
      bullets(p.bullets)
      c.y += 5
    })
  }

  const education = (stacked: boolean) => {
    if (!resume.education.length) return
    heading('Education')
    resume.education.forEach((e) => {
      const title = [e.degree, e.field].filter(Boolean).join(' in ')
      if (stacked) {
        paragraph(title, { size: 9.5, style: 'bold' })
        paragraph(e.school, { size: 9.5, style: 'italic', hex: st.muted })
        paragraph(e.year, { size: 9.5, hex: st.muted })
        if (e.details) paragraph(e.details, { size: 9.5, hex: st.muted })
      } else {
        ensure(lineH(BODY) * 2)
        row(title, e.year)
        paragraph([e.school, e.details].filter(Boolean).join(' · '), { style: 'italic', hex: st.muted })
      }
      c.y += 5
    })
  }

  const skills = (list: boolean) => {
    if (!resume.skills.length) return
    heading('Skills')
    if (list) resume.skills.forEach((s) => paragraph(s, { size: 9.5 }))
    else paragraph(resume.skills.join(', '))
  }

  if (sidebar) {
    // Left column first, then back to page 1 for the main column
    c = { x: SIDE_PAD, w: SIDE_W - SIDE_PAD * 2, y: SIDE_TOP, top: SIDE_TOP, page: 1 }
    if (photo && sidebarTop) {
      drawPhoto(c.x, c.y)
      c.y += ph
    }
    if (contact.length) {
      heading('Contact')
      contact.forEach((l) => paragraph(l, { size: 9.5 }))
    }
    skills(true)
    education(true)

    doc.setPage(1)
    c = {
      x: SIDE_W + MAIN_PAD_L,
      w: PW - SIDE_W - MAIN_PAD_L - MAIN_PAD_R,
      y: SIDE_TOP,
      top: SIDE_TOP,
      page: 1,
    }
    header()
    summary()
    experience()
    projects()
  } else {
    header()
    summary()
    experience()
    projects()
    education(false)
    skills(false)
  }

  const safe = fileName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'resume'
  doc.save(safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`)
}
