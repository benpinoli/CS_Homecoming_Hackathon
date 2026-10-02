import type { ResumeExtraction } from '../../parse_resume.ts'

const STORAGE_KEY = 'resume-inator.experience-bank'

export type BankFactStatus = 'extracted' | 'needs_review' | 'confirmed' | 'disputed' | 'withdrawn'

export interface BankFact {
  id: string
  entityId: string
  section: string
  key: string
  valueText: string
  assertion_status: BankFactStatus
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.name === 'string' && record.kind) return record.name.trim()
    if (typeof record.name === 'string' && !record.metric) return record.name.trim()
    const parts = [record.metric, record.value, record.unit, record.multiplier, record.statement]
      .map(textValue)
      .filter(Boolean)
    if (parts.length > 0) return parts.join(' ')
  }
  return ''
}

function entities(value: unknown): Array<{ id?: string; facts?: Array<{ id?: string; key?: string; value?: unknown; assertion_status?: string }> }> {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value as { id?: string; facts?: [] }]
  return []
}

export function factsFromExtraction(extraction: ResumeExtraction): BankFact[] {
  const profile = extraction.candidate_profile as unknown as Record<string, unknown>
  const sections = [
    'person',
    'experience',
    'education',
    'projects',
    'skills',
    'volunteering',
    'certifications',
    'awards',
    'languages',
  ]
  const facts: BankFact[] = []
  for (const section of sections) {
    entities(profile[section]).forEach((entity, index) => {
      const entityId = entity.id || `${section}_${index + 1}`
      for (const fact of entity.facts ?? []) {
        const valueText = textValue(fact.value)
        if (!fact.id || !fact.key || !valueText) continue
        const status = fact.assertion_status === 'confirmed' ? 'extracted' : fact.assertion_status
        facts.push({
          id: fact.id,
          entityId,
          section,
          key: fact.key,
          valueText,
          assertion_status: (status as BankFactStatus) || 'extracted',
        })
      }
    })
  }
  return facts
}

export function loadBank(): BankFact[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as BankFact[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBank(facts: BankFact[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(facts))
}

/** Incoming parse replaces unconfirmed facts. Facts the user already confirmed stay confirmed. */
export function mergeBank(existing: BankFact[], incoming: BankFact[]): BankFact[] {
  const confirmed = new Map(existing.filter((fact) => fact.assertion_status === 'confirmed').map((fact) => [fact.id, fact]))
  const merged = incoming.map((fact) => confirmed.get(fact.id) ?? { ...fact, assertion_status: fact.assertion_status === 'confirmed' ? 'extracted' : fact.assertion_status })
  const incomingIds = new Set(incoming.map((fact) => fact.id))
  for (const fact of confirmed.values()) {
    if (!incomingIds.has(fact.id)) merged.push(fact)
  }
  return merged
}

export function setFactStatus(facts: BankFact[], factId: string, status: BankFactStatus): BankFact[] {
  return facts.map((fact) => (fact.id === factId ? { ...fact, assertion_status: status } : fact))
}

export function confirmedFacts(facts: BankFact[]): BankFact[] {
  return facts.filter((fact) => fact.assertion_status === 'confirmed')
}
