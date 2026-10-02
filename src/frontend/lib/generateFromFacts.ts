import type { BankFact } from './experienceBank.ts'
import { confirmedFacts } from './experienceBank.ts'
import type { JobRequirement, KeywordLink } from './requirementMatch.ts'
import { containsPhrase } from './requirementMatch.ts'
import type { GeneratedResume, TailoringPoint } from '../types'

export interface BulletRecord {
  section: 'experience' | 'projects' | 'education' | 'skills'
  text: string
  factIds: string[]
}

export interface ResumeValidation {
  ok: boolean
  problems: string[]
  pageEstimate: number
  retries: number
}

export interface GeneratedFromFacts {
  resume: GeneratedResume
  bullets: BulletRecord[]
  keywordBank: KeywordLink[]
  validation: ResumeValidation
  tailoring: TailoringPoint[]
  factIds: string[]
}

const BULLET_KEYS = new Set([
  'personal_responsibilities',
  'personal_contributions',
  'activities',
  'outcome_metric',
  'honors',
  'listed_coursework',
])

const LINES_PER_PAGE = 42

function first(facts: BankFact[], key: string): string {
  return facts.find((fact) => fact.key === key)?.valueText ?? ''
}

function score(fact: BankFact, requirements: JobRequirement[]): number {
  let total = 0
  for (const requirement of requirements) {
    const hit = requirement.alternatives.some((alternative) => containsPhrase(fact.valueText, alternative))
    if (!hit) continue
    total += requirement.importance === 'required' ? 3 : 1
  }
  return total
}

function pageEstimate(resume: GeneratedResume): number {
  const lines =
    6 +
    (resume.summary ? 3 : 0) +
    resume.experience.reduce((n, item) => n + 2 + item.bullets.length, 0) +
    resume.projects.reduce((n, item) => n + 2 + item.bullets.length, 0) +
    resume.education.length * 2 +
    (resume.skills.length ? 2 : 0)
  return Math.max(1, Math.ceil(lines / LINES_PER_PAGE))
}

function keywordBank(bullets: BulletRecord[], skills: string[]): KeywordLink[] {
  const links: KeywordLink[] = []
  const push = (keyword: string, bulletText: string, factIds: string[]) => {
    const cleaned = keyword.trim()
    if (cleaned.length < 2) return
    if (links.some((item) => item.keyword.toLowerCase() === cleaned.toLowerCase() && item.bulletText === bulletText)) return
    links.push({ keyword: cleaned, bulletText, factIds })
  }
  for (const bullet of bullets) {
    for (const token of bullet.text.match(/[A-Za-z][A-Za-z0-9+#.]*/g) ?? []) {
      if (token.length > 2) push(token, bullet.text, bullet.factIds)
    }
  }
  for (const skill of skills) {
    const bullet = bullets.find((item) => containsPhrase(item.text, skill))
    push(skill, bullet?.text ?? skill, bullet?.factIds ?? [])
  }
  return links
}

function assemble(facts: BankFact[], requirements: JobRequirement[]): { resume: GeneratedResume; bullets: BulletRecord[] } {
  const byEntity = new Map<string, BankFact[]>()
  for (const fact of facts) {
    const group = byEntity.get(fact.entityId) ?? []
    group.push(fact)
    byEntity.set(fact.entityId, group)
  }
  const person = facts.filter((fact) => fact.section === 'person')
  const bullets: BulletRecord[] = []
  const resume: GeneratedResume = {
    name: first(person, 'full_name') || first(person, 'name'),
    email: first(person, 'email'),
    phone: first(person, 'phone'),
    location: first(person, 'location'),
    links: person.filter((fact) => /url|linkedin|github|portfolio/i.test(fact.key)).map((fact) => fact.valueText),
    summary: '',
    experience: [],
    projects: [],
    education: [],
    skills: facts.filter((fact) => fact.section === 'skills' && fact.key === 'name').map((fact) => fact.valueText),
  }

  const entities = [...byEntity.entries()].sort((a, b) => score(b[1][0], requirements) - score(a[1][0], requirements))
  for (const [, group] of entities) {
    const section = group[0].section
    const detailFacts = group
      .filter((fact) => BULLET_KEYS.has(fact.key))
      .sort((a, b) => score(b, requirements) - score(a, requirements))
    if (section === 'experience') {
      const entry = {
        company: first(group, 'organization'),
        position: first(group, 'title'),
        location: first(group, 'location'),
        duration: [first(group, 'start_date'), first(group, 'end_date') || first(group, 'completion_status')].filter(Boolean).join(' – '),
        bullets: detailFacts.map((fact) => fact.valueText),
      }
      if (entry.company || entry.position || entry.bullets.length) resume.experience.push(entry)
    } else if (section === 'projects') {
      const entry = {
        name: first(group, 'name'),
        technologies: group.filter((fact) => fact.key === 'tools_used').map((fact) => fact.valueText).join(', '),
        link: first(group, 'public_url'),
        bullets: detailFacts.map((fact) => fact.valueText),
      }
      if (entry.name || entry.bullets.length) resume.projects.push(entry)
    } else if (section === 'education') {
      resume.education.push({
        school: first(group, 'institution'),
        degree: first(group, 'degree'),
        field: first(group, 'field'),
        year: first(group, 'end_date') || first(group, 'expected_end_date'),
        details: detailFacts.map((fact) => fact.valueText).join('\n'),
      })
    }
    for (const fact of detailFacts) {
      const bulletSection = section === 'projects' ? 'projects' : section === 'education' ? 'education' : 'experience'
      bullets.push({ section: bulletSection, text: fact.valueText, factIds: [fact.id] })
    }
  }
  return { resume, bullets }
}

function dropLowestBullet(resume: GeneratedResume, bullets: BulletRecord[]): boolean {
  for (const collection of [resume.projects, resume.experience] as const) {
    for (let i = collection.length - 1; i >= 0; i -= 1) {
      const entry = collection[i]
      if (entry.bullets.length === 0) continue
      const removed = entry.bullets.pop()
      const index = bullets.findIndex((item) => item.text === removed)
      if (index >= 0) bullets.splice(index, 1)
      return true
    }
  }
  return false
}

export function generateFromConfirmedFacts(
  facts: BankFact[],
  requirements: JobRequirement[],
  pageLimit = 1,
): GeneratedFromFacts {
  const confirmed = confirmedFacts(facts)
  let { resume, bullets } = assemble(confirmed, requirements)
  let retries = 0
  let estimate = pageEstimate(resume)
  while (estimate > pageLimit && retries < 6 && dropLowestBullet(resume, bullets)) {
    retries += 1
    estimate = pageEstimate(resume)
  }
  const problems: string[] = []
  if (confirmed.length === 0) problems.push('No confirmed facts. Confirm facts in the Data Bank before generating.')
  if (estimate > pageLimit) problems.push(`Still about ${estimate} pages after ${retries} shorten attempts. Review the layout.`)
  const joined = JSON.stringify(resume)
  if (joined.includes('{{') || joined.includes('}}')) problems.push('Unresolved template placeholders in the resume text.')
  const factIds = [...new Set(bullets.flatMap((bullet) => bullet.factIds))]
  const unknown = factIds.filter((id) => !confirmed.some((fact) => fact.id === id))
  if (unknown.length > 0) problems.push(`Bullets cite facts that are not confirmed: ${unknown.join(', ')}`)
  const tailoring: TailoringPoint[] = [
    {
      id: 'wording',
      area: 'Wording',
      detail: 'Bullets are confirmed fact text. The layout is applied by the template, not rewritten by the model.',
    },
  ]
  for (const requirement of requirements.filter((item) => item.importance === 'required')) {
    const supported = confirmed.some((fact) =>
      requirement.alternatives.some((alternative) => containsPhrase(fact.valueText, alternative)),
    )
    if (!supported) {
      tailoring.push({
        id: requirement.id,
        area: 'Missing requirement',
        detail: `${requirement.label} is not supported by a confirmed fact, so it was left off the resume.`,
      })
    }
  }
  return {
    resume,
    bullets,
    keywordBank: keywordBank(bullets, resume.skills),
    validation: { ok: problems.length === 0, problems, pageEstimate: estimate, retries },
    tailoring,
    factIds,
  }
}
