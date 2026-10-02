import type { ResumeSourceBlock } from './parse_resume.ts'

export type IngestResult = {
  blocks: ResumeSourceBlock[]
  unreadableLocators: string[]
}

export type PdfTextItem = {
  str: string
  x: number
  y: number
  hasEOL?: boolean
}

const BULLET_PATTERN = /^(?:[•●▪◦*-]|\d+[.)])\s+\S/

/**
 * Split plain text into locator-tagged blocks.
 * Bracket labels such as `[experience_01]` stay intact.
 * Other text keeps line ranges and does not collapse into a single line_1 block.
 */
export function segmentResumeIntoBlocks(text: string): ResumeSourceBlock[] {
  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const hasBrackets = lines.some((line) => /^\s*\[[^\]]+\]/.test(line))
  if (hasBrackets) {
    return segmentBracketedBlocks(lines)
  }
  return segmentPlainTextBlocks(lines)
}

function segmentBracketedBlocks(lines: string[]): ResumeSourceBlock[] {
  const blocks: ResumeSourceBlock[] = []
  let current: ResumeSourceBlock | null = null
  const pattern = /^\s*\[([^\]]+)\]\s*(.*)$/

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current) {
        blocks.push(current)
        current = null
      }
      continue
    }
    const match = pattern.exec(trimmed)
    if (match) {
      if (current) {
        blocks.push(current)
      }
      current = {
        locator: match[1],
        text: match[2].trim() || trimmed,
      }
      continue
    }
    if (current) {
      current.text = `${current.text}\n${trimmed}`
    } else {
      blocks.push({ locator: 'preamble', text: trimmed })
    }
  }
  if (current) {
    blocks.push(current)
  }
  return blocks
}

function segmentPlainTextBlocks(lines: string[]): ResumeSourceBlock[] {
  const blocks: ResumeSourceBlock[] = []
  let buffer: string[] = []
  let startLine = 0

  const flush = (endLine: number) => {
    const text = buffer.join('\n').trim()
    if (!text) {
      buffer = []
      return
    }
    const locator =
      startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`
    blocks.push({ locator, text })
    buffer = []
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const trimmed = line.trim()
    if (!trimmed) {
      if (buffer.length > 0) {
        flush(lineNumber - 1)
      }
      return
    }
    if (BULLET_PATTERN.test(trimmed)) {
      if (buffer.length > 0) {
        flush(lineNumber - 1)
      }
      blocks.push({ locator: `line ${lineNumber}`, text: trimmed })
      return
    }
    if (buffer.length === 0) {
      startLine = lineNumber
    }
    buffer.push(trimmed)
  })

  if (buffer.length > 0) {
    flush(lines.length)
  }
  return blocks
}

export function blocksFromPdfTextItems(pages: PdfTextItem[][]): IngestResult {
  const blocks: ResumeSourceBlock[] = []
  const unreadableLocators: string[] = []

  pages.forEach((items, pageIndex) => {
    const pageNumber = pageIndex + 1
    const textItems = items.filter((item) => item.str.trim().length > 0)
    if (textItems.length === 0) {
      unreadableLocators.push(`page ${pageNumber}`)
      return
    }

    const lines = groupPdfLines(textItems)
    let paragraph: string[] = []
    let paragraphIndex = 0
    let bulletIndex = 0
    let previousY: number | null = null

    const flushParagraph = () => {
      const text = paragraph.join(' ').replace(/\s+/g, ' ').trim()
      paragraph = []
      if (!text) {
        return
      }
      paragraphIndex += 1
      blocks.push({
        locator: `page ${pageNumber}, paragraph ${paragraphIndex}`,
        text,
      })
    }

    for (const line of lines) {
      const gap = previousY === null ? 0 : previousY - line.y
      previousY = line.y
      if (BULLET_PATTERN.test(line.text)) {
        flushParagraph()
        bulletIndex += 1
        blocks.push({
          locator: `page ${pageNumber}, bullet ${bulletIndex}`,
          text: line.text,
        })
        continue
      }
      if (paragraph.length > 0 && gap > line.height * 1.6) {
        flushParagraph()
      }
      paragraph.push(line.text)
    }
    flushParagraph()
  })

  return { blocks, unreadableLocators }
}

function groupPdfLines(items: PdfTextItem[]): Array<{ text: string; y: number; height: number }> {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: Array<{ parts: PdfTextItem[]; y: number }> = []

  for (const item of sorted) {
    const current = lines[lines.length - 1]
    if (!current || Math.abs(current.y - item.y) > 2) {
      lines.push({ parts: [item], y: item.y })
    } else {
      current.parts.push(item)
    }
  }

  return lines.map((line) => {
    const parts = [...line.parts].sort((a, b) => a.x - b.x)
    return {
      text: parts
        .map((part) => part.str.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
      y: line.y,
      height: 12,
    }
  })
}
