/**
 * Detects entries in a Data Bank section that look like repeats of an earlier entry, so an import
 * that overlaps with what is already stored (or with itself) can be flagged.
 */

type Entry = { id: string } & Record<string, string>

export interface DupInfo {
  /** The earlier entry this one resembles */
  of: string
  /** Fields that matched, to highlight */
  fields: string[]
}

const NOISE = new Set(['inc', 'llc', 'ltd', 'co', 'corp', 'corporation', 'company', 'the', 'and', 'of', 'a', 'an', 'at', 'in'])

/** Lowercase, no accents or punctuation, without filler words like "Inc" */
export function normalize(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\+/g, ' plus ') // C++ is not C
    .replace(/#/g, ' sharp ') // C# is not C
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(' ')
}

/** Equal after normalizing, one contains the other as whole words, or the word overlap is high */
export function similar(a: string | undefined, b: string | undefined): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (!x || !y) return false
  if (x === y) return true
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  if (short.length >= 5 && ` ${long} `.includes(` ${short} `)) return true
  const sx = new Set(x.split(' '))
  const sy = new Set(y.split(' '))
  const shared = [...sx].filter((w) => sy.has(w)).length
  return shared / (sx.size + sy.size - shared) >= 0.75
}

const sameDate = (a: string | undefined, b: string | undefined) => !!normalize(a) && normalize(a) === normalize(b)

type Rule = (a: Entry, b: Entry) => string[] | null

/** Which fields of `a` and `b` make them look like the same thing, per section */
const RULES: Record<string, Rule> = {
  experience: (a, b) => {
    if (!similar(a.company, b.company)) return null
    if (similar(a.position, b.position)) return ['company', 'position']
    if (sameDate(a.startDate, b.startDate)) return ['company', 'startDate']
    return null
  },
  education: (a, b) => {
    if (!similar(a.school, b.school)) return null
    if (similar(a.degree, b.degree) && similar(a.field, b.field)) return ['school', 'degree', 'field']
    if (similar(a.field, b.field)) return ['school', 'field']
    if (similar(a.degree, b.degree) && !normalize(a.field) && !normalize(b.field)) return ['school', 'degree']
    return null
  },
  projects: (a, b) => (similar(a.name, b.name) ? ['name'] : null),
  skills: (a, b) => (similar(a.name, b.name) ? ['name'] : null),
  volunteer: (a, b) => (similar(a.organization, b.organization) && similar(a.role, b.role) ? ['organization', 'role'] : null),
  certifications: (a, b) => (similar(a.name, b.name) ? ['name'] : null),
}

/** Entry id -> what it duplicates. Only the later of two matching entries is flagged. */
export function findDuplicates(sectionId: string, entries: Entry[]): Map<string, DupInfo> {
  const flagged = new Map<string, DupInfo>()
  const rule = RULES[sectionId]
  if (!rule) return flagged
  entries.forEach((entry, i) => {
    for (let j = 0; j < i; j++) {
      const fields = rule(entry, entries[j])
      if (fields) {
        flagged.set(entry.id, { of: entries[j].id, fields })
        break
      }
    }
  })
  return flagged
}
