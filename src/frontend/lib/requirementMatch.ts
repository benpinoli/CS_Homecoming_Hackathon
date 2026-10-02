/** Job requirements matched against one saved resume's keyword bank, not the whole experience bank. */

export type RequirementImportance = 'required' | 'preferred'

export interface JobRequirement {
  id: string
  importance: RequirementImportance
  /** Any one of these satisfies the requirement ("Python or Java"). */
  alternatives: string[]
  /** When set, the supporting text must state at least this many years. */
  minYears?: number
  label: string
}

export interface KeywordLink {
  keyword: string
  bulletText: string
  factIds: string[]
}

export interface RequirementMatch {
  requirement: JobRequirement
  matched: boolean
  keyword?: KeywordLink
}

const YEAR_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function containsPhrase(text: string, phrase: string): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(phrase)}(?![A-Za-z0-9])`, 'i')
  return pattern.test(text)
}

function yearsInText(text: string): number[] {
  const found: number[] = []
  for (const match of text.matchAll(/\b(\d+(?:\.\d+)?)\s*\+?\s*years?\b/gi)) {
    found.push(Number(match[1]))
  }
  for (const match of text.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/gi)) {
    found.push(YEAR_WORDS[match[1].toLowerCase()])
  }
  return found
}

function supportsYears(text: string, minYears: number | undefined): boolean {
  if (minYears == null) return true
  return yearsInText(text).some((years) => years + 1e-9 >= minYears)
}

/** A keyword match counts only when that keyword's linked bullet states the requirement. */
export function matchRequirement(requirement: JobRequirement, bank: KeywordLink[]): RequirementMatch {
  for (const alternative of requirement.alternatives) {
    const link = bank.find(
      (item) =>
        item.keyword.toLowerCase() === alternative.toLowerCase() &&
        containsPhrase(item.bulletText, alternative) &&
        supportsYears(item.bulletText, requirement.minYears),
    )
    if (link) return { requirement, matched: true, keyword: link }
  }
  return { requirement, matched: false }
}

export function splitMatches(requirements: JobRequirement[], bank: KeywordLink[]) {
  const results = requirements.map((requirement) => matchRequirement(requirement, bank))
  const pick = (importance: RequirementImportance, matched: boolean) =>
    results.filter((item) => item.requirement.importance === importance && item.matched === matched)
  return {
    results,
    requiredMatched: pick('required', true),
    requiredMissing: pick('required', false),
    preferredMatched: pick('preferred', true),
    preferredMissing: pick('preferred', false),
  }
}

const HEADING = /^(required|preferred|minimum|qualifications|requirements|nice to have)\b/i

/** Read required vs preferred lines. "A or B" is one requirement. "N years of X" keeps the year minimum. */
const GENERIC_KEYWORDS = new Set([
  'communication',
  'teamwork',
  'team player',
  'fast learner',
  'hard worker',
  'detail-oriented',
  'self-starter',
  'interpersonal skills',
])

export interface AnalyzedRequirement {
  label?: string
  importance?: string
  alternatives?: string[]
  min_years?: number | null
}

/** Model output from the job-analysis prompt, narrowed to the matcher’s requirement shape. */
export function requirementsFromAnalysis(requirements: AnalyzedRequirement[]): JobRequirement[] {
  const mapped: JobRequirement[] = []
  for (const item of requirements) {
    const alternatives = (item.alternatives ?? [])
      .map((alternative) => alternative.trim())
      .filter((alternative) => alternative.length > 1 && !GENERIC_KEYWORDS.has(alternative.toLowerCase()))
    if (alternatives.length === 0) continue
    const importance = item.importance === 'preferred' || item.importance === 'nice_to_have' ? 'preferred' : 'required'
    mapped.push({
      id: `req_${mapped.length + 1}`,
      importance,
      alternatives,
      minYears: typeof item.min_years === 'number' ? item.min_years : undefined,
      label: item.label?.trim() || alternatives.join(' or '),
    })
  }
  return mapped
}

export function requirementsFromJobText(text: string): JobRequirement[] {
  let importance: RequirementImportance = 'required'
  const requirements: JobRequirement[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^[\s•●▪◦*-]+/, '').trim()
    if (!line) continue
    if (HEADING.test(line) && line.length < 80) {
      importance = /preferred|nice to have/i.test(line) ? 'preferred' : 'required'
      continue
    }
    const yearMatch = /\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?(?:\s+of)?\s+([A-Za-z][A-Za-z0-9+#.]*)/i.exec(line)
    const alternatives = line
      .split(/\s+or\s+/i)
      .map((part) => part.replace(/^[\d+]+\s*\+?\s*years?(?:\s+of)?\s+/i, '').replace(/[.,;:]+$/g, '').trim())
      .filter((part) => part.length > 1)
    if (alternatives.length === 0) continue
    const minYears = yearMatch
      ? Number.isFinite(Number(yearMatch[1]))
        ? Number(yearMatch[1])
        : YEAR_WORDS[yearMatch[1].toLowerCase()]
      : undefined
    requirements.push({
      id: `req_${requirements.length + 1}`,
      importance,
      alternatives: yearMatch ? [yearMatch[2]] : alternatives,
      minYears,
      label: line,
    })
  }
  return requirements
}

/** Missing job requirements that confirmed fact text could honestly support. */
export function gapsFillableFromConfirmed(
  missing: RequirementMatch[],
  confirmedTexts: Array<{ factId: string; text: string }>,
): RequirementMatch[] {
  return missing.filter((item) =>
    item.requirement.alternatives.some((alternative) =>
      confirmedTexts.some(
        (fact) =>
          containsPhrase(fact.text, alternative) && supportsYears(fact.text, item.requirement.minYears),
      ),
    ),
  )
}
