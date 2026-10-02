import type { ResumeExtraction } from '../../parse_resume.ts'
import type { FactRecord } from '../../resume_field_conventions.ts'
import type { ResumeImport } from '../types'

type Entity = { facts?: FactRecord[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function entities(value: unknown): Entity[] {
  if (Array.isArray(value)) return value as Entity[]
  if (value && typeof value === 'object' && Array.isArray((value as Entity).facts)) return [value as Entity]
  return []
}

function factsOf(entity: Entity): FactRecord[] {
  return (entity.facts ?? []).filter((fact) => fact.assertion_status !== 'withdrawn' && fact.value != null)
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.name === 'string') return record.name.trim()
    if (typeof record.statement === 'string') return record.statement.trim()
    const parts = [record.metric, record.value, record.unit, record.multiplier]
      .map(textValue)
      .filter(Boolean)
    return parts.join(' ')
  }
  return ''
}

function values(facts: FactRecord[], key: string): string[] {
  return facts.filter((fact) => fact.key === key).map((fact) => textValue(fact.value)).filter(Boolean)
}

function first(facts: FactRecord[], ...keys: string[]): string {
  for (const key of keys) {
    const found = values(facts, key)[0]
    if (found) return found
  }
  return ''
}

function joined(facts: FactRecord[], ...keys: string[]): string {
  return keys.flatMap((key) => values(facts, key)).join('\n')
}

function displayDate(value: string): string {
  if (!value) return ''
  if (/^(ongoing|present|current|now)$/i.test(value)) return 'Present'
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value)
  if (!match) return value
  const month = MONTHS[Number(match[2]) - 1]
  return month ? `${month} ${match[1]}` : value
}

function endLabel(facts: FactRecord[]): string {
  const status = first(facts, 'completion_status')
  if (/ongoing/i.test(status)) return 'Present'
  return displayDate(first(facts, 'end_date', 'expected_end_date', 'listed_date'))
}

function startLabel(facts: FactRecord[]): string {
  return displayDate(first(facts, 'start_date', 'listed_date'))
}

function findLink(facts: FactRecord[], pattern: RegExp): string {
  for (const fact of facts) {
    const text = textValue(fact.value)
    if (pattern.test(text)) return text
  }
  return ''
}

/** Turn a parser profile into the text fields the Data Bank form edits. */
export function extractionToResumeImport(extraction: ResumeExtraction): ResumeImport {
  const profile = extraction.candidate_profile
  const person = factsOf(entities(profile.person)[0] ?? {})
  const allFacts = [
    person,
    ...entities(profile.experience).map(factsOf),
    ...entities(profile.projects).map(factsOf),
    ...entities(profile.education).map(factsOf),
  ].flat()

  const data: ResumeImport['data'] = {
    profile: [{
      name: first(person, 'full_name', 'name'),
      email: first(person, 'email'),
      phone: first(person, 'phone'),
      location: first(person, 'location'),
      linkedin: findLink(allFacts, /linkedin\.com/i),
      website: first(person, 'portfolio_url', 'website') || findLink(person, /github\.com/i),
      summary: first(person, 'summary', 'professional_summary'),
    }],
    experience: entities(profile.experience).map((entity) => {
      const facts = factsOf(entity)
      return {
        company: first(facts, 'organization', 'company'),
        position: first(facts, 'title', 'position', 'role'),
        location: first(facts, 'location'),
        startDate: startLabel(facts),
        endDate: endLabel(facts),
        description: joined(facts, 'personal_responsibilities', 'personal_contributions', 'activities', 'outcome_metric'),
      }
    }),
    education: entities(profile.education).map((entity) => {
      const facts = factsOf(entity)
      return {
        school: first(facts, 'institution', 'school'),
        degree: first(facts, 'degree'),
        field: first(facts, 'field'),
        location: first(facts, 'location'),
        startDate: startLabel(facts),
        endDate: endLabel(facts),
        gpa: first(facts, 'gpa'),
        details: joined(facts, 'honors', 'listed_coursework', 'completed_coursework', 'activities'),
      }
    }),
    projects: entities(profile.projects).map((entity) => {
      const facts = factsOf(entity)
      return {
        name: first(facts, 'name'),
        role: first(facts, 'role', 'context'),
        technologies: joined(facts, 'tools_used').replaceAll('\n', ', '),
        link: first(facts, 'public_url', 'url'),
        startDate: startLabel(facts),
        endDate: endLabel(facts),
        description: joined(facts, 'personal_contributions', 'personal_responsibilities', 'outcome_metric', 'problem'),
      }
    }),
    skills: entities(profile.skills).map((entity) => {
      const facts = factsOf(entity)
      return {
        name: first(facts, 'name'),
        category: first(facts, 'category'),
      }
    }),
    volunteer: entities(profile.volunteering).map((entity) => {
      const facts = factsOf(entity)
      return {
        organization: first(facts, 'organization'),
        role: first(facts, 'role', 'title'),
        startDate: startLabel(facts),
        endDate: endLabel(facts),
        description: joined(facts, 'activities', 'personal_responsibilities', 'outcome_metric'),
      }
    }),
    certifications: [
      ...entities(profile.certifications),
      ...entities(profile.awards),
    ].map((entity) => {
      const facts = factsOf(entity)
      return {
        name: first(facts, 'name'),
        issuer: first(facts, 'issuer', 'organization'),
        date: displayDate(first(facts, 'issued_date', 'awarded_date', 'listed_date', 'end_date')),
      }
    }),
  }

  const warnings = extraction.extraction_report?.warnings ?? []
  return { data, warnings }
}
