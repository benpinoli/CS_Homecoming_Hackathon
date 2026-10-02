export type BlockRole = 'contact' | 'heading' | 'experience' | 'project' | 'bullet' | 'example' | 'other'

export interface TemplateBlock {
  id: string
  text: string
  role: BlockRole
}

export interface ResumeTemplate {
  id: string
  name: string
  kind: 'builtin' | 'docx' | 'reference'
  version: number
  pageLimit: number
  approved: boolean
  blocks: TemplateBlock[]
  /** Shown when a PDF or image is only a visual reference. */
  referenceNote?: string
}

const TEMPLATE_KEY = 'resume-inator.templates'
const ACTIVE_KEY = 'resume-inator.active-template'

const HEADINGS = /^(experience|work experience|education|projects|skills|summary|contact|volunteer|certifications|awards)$/i

export function proposeBlockRole(text: string): BlockRole {
  const line = text.trim()
  if (!line) return 'other'
  if (/@|linkedin\.com|\(\d{3}\)/i.test(line)) return 'contact'
  if (HEADINGS.test(line.replace(/[:\s]+$/g, ''))) return 'heading'
  if (/^[•●▪◦*-]\s+/.test(line)) return 'bullet'
  if (line.length < 60 && /[|]/.test(line)) return 'experience'
  return 'example'
}

export function proposeTemplateBlocks(paragraphs: string[]): TemplateBlock[] {
  return paragraphs
    .map((text) => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `block_${index + 1}`,
      text,
      role: proposeBlockRole(text),
    }))
}

export function builtinTemplates(): ResumeTemplate[] {
  return [
    { id: 'centered', name: 'Centered', kind: 'builtin', version: 1, pageLimit: 1, approved: true, blocks: [] },
    { id: 'left', name: 'Left', kind: 'builtin', version: 1, pageLimit: 1, approved: true, blocks: [] },
    { id: 'banner', name: 'Banner', kind: 'builtin', version: 1, pageLimit: 1, approved: true, blocks: [] },
    { id: 'sidebar', name: 'Sidebar', kind: 'builtin', version: 1, pageLimit: 1, approved: true, blocks: [] },
  ]
}

export function loadTemplates(): ResumeTemplate[] {
  try {
    const custom = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]') as ResumeTemplate[]
    return [...builtinTemplates(), ...(Array.isArray(custom) ? custom : [])]
  } catch {
    return builtinTemplates()
  }
}

export function saveCustomTemplates(templates: ResumeTemplate[]): void {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates.filter((item) => item.kind !== 'builtin')))
}

export function loadActiveTemplateId(): string {
  return localStorage.getItem(ACTIVE_KEY) || 'centered'
}

export function saveActiveTemplateId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id)
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.length - 22 - 65535)
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return i
  }
  return -1
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Read paragraph text from a DOCX. Example sentences stay example content, not user facts. */
export async function paragraphsFromDocx(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const eocd = findEndOfCentralDirectory(bytes)
  if (eocd < 0) throw new Error('That DOCX could not be read. Save it as a simple Word document and try again.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  let xml = ''
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) break
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength
    if (name !== 'word/document.xml') continue
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
    const raw = method === 0 ? compressed : await inflate(compressed)
    xml = new TextDecoder().decode(raw)
    break
  }
  if (!xml) throw new Error('That DOCX has no document body. Use a simple Word file without floating graphics.')
  const paragraphs: string[] = []
  for (const match of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const texts = [...match[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((item) => item[1])
    const line = texts.join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    if (line) paragraphs.push(line)
  }
  return paragraphs
}
