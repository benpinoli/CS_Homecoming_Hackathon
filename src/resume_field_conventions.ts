/**
 * Fact-key conventions for schema 1.0.
 * New keys are additive. Existing records stay valid.
 * Multi-value keys must never be stored in a map keyed only by fact.key.
 */

export const MULTI_VALUE_FACT_KEYS = new Set([
  'personal_contributions',
  'personal_responsibilities',
  'activities',
  'tools_used',
  'outcome_metric',
  'listed_coursework',
  'completed_coursework',
  'in_progress_coursework',
  'team_contributions_by_others',
])

export const SINGLE_VALUE_FACT_KEYS = new Set([
  'full_name',
  'email',
  'phone',
  'location',
  'organization',
  'title',
  'name',
  'start_date',
  'end_date',
  'expected_end_date',
  'listed_date',
  'completion_status',
  'related_experience_id',
  'proposed_related_experience_id',
  'associated_organization',
  'public_disclosure',
  'source_platform',
  'proficiency',
])

export type FactRecord = {
  id: string
  key: string
  value: unknown
  assertion_status: string
  evidence_ids: string[]
  confirmation_evidence_id: string | null
  confirmed_by: string | null
  confirmed_at: string | null
}

export function groupFactsByKey(facts: FactRecord[]): Map<string, FactRecord[]> {
  const grouped = new Map<string, FactRecord[]>()
  for (const fact of facts) {
    const existing = grouped.get(fact.key) ?? []
    existing.push(fact)
    grouped.set(fact.key, existing)
  }
  return grouped
}

export type FactKeyConflict = {
  entity_id: string
  field_key: string
  fact_ids: string[]
  description: string
}

export function singleValueConflicts(
  entityId: string,
  facts: FactRecord[],
): FactKeyConflict[] {
  const conflicts: FactKeyConflict[] = []
  for (const [key, group] of groupFactsByKey(facts)) {
    if (!SINGLE_VALUE_FACT_KEYS.has(key) || group.length < 2) {
      continue
    }
    const distinct = new Set(group.map((fact) => JSON.stringify(fact.value)))
    if (distinct.size < 2) {
      continue
    }
    conflicts.push({
      entity_id: entityId,
      field_key: key,
      fact_ids: group.map((fact) => fact.id),
      description: `Multiple active values for single-valued key ${key}.`,
    })
  }
  return conflicts
}
