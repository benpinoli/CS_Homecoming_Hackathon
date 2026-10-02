import type {
  ParseResumeApiRequest,
  ResumeExtraction,
  ResumeInputSource,
  ResumeSourceBlock,
} from './parse_resume.ts'
import {
  type FactKeyConflict,
  type FactRecord,
  groupFactsByKey,
  singleValueConflicts,
} from './resume_field_conventions.ts'

type EvidenceRecord = {
  id: string
  source_id: string
  locator: string
  quote: string
}

type EntityRecord = {
  id: string
  facts: FactRecord[]
}

type ProfileRecord = {
  evidence: EvidenceRecord[]
  open_questions: QuestionRecord[]
  conflicts: ConflictRecord[]
  experience: EntityRecord[]
  projects: EntityRecord[]
  education: EntityRecord[]
  skills: EntityRecord[]
  awards: EntityRecord[]
  volunteering: EntityRecord[]
  languages: EntityRecord[]
  [key: string]: unknown
}

type QuestionRecord = {
  id: string
  entity_id: string | null
  field_key: string | null
  question: string
  reason: string
  evidence_ids: string[]
  state: string
}

type ConflictRecord = {
  id: string
  entity_id: string
  field_key: string
  fact_ids: string[]
  description: string
  state: string
  resolution_evidence_id: string | null
}

const ENTITY_KEYS = [
  'education',
  'experience',
  'projects',
  'skills',
  'awards',
  'certifications',
  'publications',
  'volunteering',
  'languages',
  'preferences',
  'other_experiences',
] as const

const MONTHS: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
}

const TOOL_KINDS: Record<string, string> = {
  python: 'programming_language',
  typescript: 'programming_language',
  javascript: 'programming_language',
  sql: 'programming_language',
  plpgsql: 'programming_language',
  'aws amplify': 'service',
  ec2: 'service',
  supabase: 'service',
  'gemini api': 'service',
  'google solar api': 'service',
  'sf-quant': 'library',
}

const NAMED_TOOLS = Object.keys(TOOL_KINDS).sort((a, b) => b.length - a.length)

type ToolMention = {
  name: string
  kind: string
  locator: string
  quote: string
  source_id: string
}

export type FactChange = {
  step: string
  action: 'added' | 'changed' | 'removed' | 'flagged'
  entity_id: string
  fact_id: string
  detail: string
  before?: unknown
  after?: unknown
}

/**
 * Apply source-grounded checks to a parser proposal.
 * This is deterministic validation and repair, not a claim that extraction is complete.
 */
export function normalizeResumeExtraction(
  extraction: ResumeExtraction,
  request: ParseResumeApiRequest,
  trace: FactChange[] = [],
): ResumeExtraction {
  const profile = structuredClone(extraction.candidate_profile) as unknown as ProfileRecord
  const report = structuredClone(extraction.extraction_report)
  const warnings = new Set(report.warnings ?? [])
  const sources = new Map(request.sources.map((source) => [source.source_id, source]))

  profile.evidence ??= []
  profile.open_questions ??= []
  profile.conflicts ??= []
  profile.experience ??= []
  profile.projects ??= []
  profile.volunteering ??= []

  for (const unreadable of request.ingestion_unprocessed_blocks ?? []) {
    const source = request.sources[0]
    if (!source) {
      continue
    }
    const token = `${source.source_id}:${unreadable}`
    if (!report.unprocessed_input_blocks.includes(token)) {
      report.unprocessed_input_blocks.push(token)
    }
    warnings.add(`Unreadable or empty block ${token}.`)
  }

  for (const key of ENTITY_KEYS) {
    const entities = profile[key]
    if (!Array.isArray(entities)) {
      continue
    }
    for (const entity of entities as EntityRecord[]) {
      normalizeEntity(entity, profile, sources, warnings, trace)
    }
  }

  for (const project of profile.projects) {
    harvestProjectTools(project, request.sources, profile, warnings, trace)
    collapseToolFacts(project, profile, trace)
    separateMetrics(project, profile, trace)
  }
  for (const entity of allEntities(profile)) {
    restoreRangeDates(entity, profile, trace)
  }
  dropDuplicateVolunteerExperience(profile, trace)
  recomputeSingleValueConflicts(profile)
  for (const job of profile.experience) {
    separateMetrics(job, profile, trace)
  }
  for (const activity of (profile.volunteering ?? []) as EntityRecord[]) {
    separateMetrics(activity, profile, trace)
  }

  reconcileRelationshipWarnings(profile, warnings, trace)
  for (const key of ENTITY_KEYS) {
    const entities = profile[key]
    if (!Array.isArray(entities)) {
      continue
    }
    for (const entity of entities as EntityRecord[]) {
      entity.facts = entity.facts.filter(
        (fact) => fact.value !== null && fact.assertion_status !== 'withdrawn',
      )
    }
  }
  for (const entity of allEntities(profile)) {
    noteUnspecifiedAccuracy(entity, profile)
  }
  resolveQuestionEntities(profile, warnings, trace)
  dedupeQuestions(profile, trace)
  report.warnings = [...warnings]
  report.needs_user_review = true
  return {
    candidate_profile: profile as ResumeExtraction['candidate_profile'],
    extraction_report: report,
  }
}

export function mergeProposalIntoProfile(
  existing: ResumeExtraction['candidate_profile'],
  proposal: ResumeExtraction['candidate_profile'],
): ResumeExtraction['candidate_profile'] {
  const base = structuredClone(existing) as unknown as ProfileRecord
  const incoming = structuredClone(proposal) as unknown as ProfileRecord
  const keptConfirmed = new Map<string, FactRecord>()

  for (const key of ENTITY_KEYS) {
    for (const entity of (base[key] as EntityRecord[] | undefined) ?? []) {
      for (const fact of entity.facts ?? []) {
        if (fact.assertion_status === 'confirmed') {
          keptConfirmed.set(fact.id, fact)
        }
      }
    }
  }

  for (const key of ENTITY_KEYS) {
    const entities = (incoming[key] as EntityRecord[] | undefined) ?? []
    for (const entity of entities) {
      entity.facts = (entity.facts ?? []).map((fact) => {
        const previous = keptConfirmed.get(fact.id)
        if (previous) {
          return previous
        }
        return stripParserConfirmation(fact)
      })
    }
    base[key] = entities
  }

  base.evidence = incoming.evidence ?? base.evidence
  base.open_questions = incoming.open_questions ?? []
  base.conflicts = incoming.conflicts ?? []
  return base as ResumeExtraction['candidate_profile']
}

function normalizeEntity(
  entity: EntityRecord,
  profile: ProfileRecord,
  sources: Map<string, ResumeInputSource>,
  warnings: Set<string>,
  trace: FactChange[],
): void {
  entity.facts = (entity.facts ?? []).flatMap((fact) =>
    normalizeFact(entity, fact, profile, sources, warnings, trace),
  )
  for (const conflict of singleValueConflicts(entity.id, entity.facts)) {
    addConflict(profile, conflict)
  }
}

function normalizeFact(
  entity: EntityRecord,
  fact: FactRecord,
  profile: ProfileRecord,
  sources: Map<string, ResumeInputSource>,
  warnings: Set<string>,
  trace: FactChange[],
): FactRecord[] {
  const cleaned = stripParserConfirmation(fact)
  if (cleaned.value === null || cleaned.value === undefined) {
    addQuestion(
      profile,
      entity.id,
      cleaned.key,
      `The resume does not state ${cleaned.key}.`,
      cleaned.evidence_ids,
    )
    warnings.add(`Omitted null ${cleaned.key} on ${entity.id}.`)
    return []
  }

  const quotes = quotesFor(cleaned, profile)
  const quoteText = quotes.map((item) => item.quote).join('\n')
  if (cleaned.key === 'outcome_metric' && !keepResolvedMetric(entity, cleaned, quoteText, profile, warnings, trace)) {
    return []
  }
  const located = quotes.filter((quote) => quoteOccursAtLocator(quote, sources))
  if (quotes.length === 0 || located.length !== quotes.length) {
    cleaned.assertion_status = 'needs_review'
    warnings.add(
      `Evidence for ${cleaned.id} is missing or is not verbatim at its locator.`,
    )
    trace.push({
      step: 'evidence_location',
      action: 'flagged',
      entity_id: entity.id,
      fact_id: cleaned.id,
      detail: 'Quote is missing or is not verbatim at its locator.',
      before: fact.value,
      after: cleaned.value,
    })
  } else {
    const verdict = supportVerdict(cleaned.key, cleaned.value, quoteText)
    if (verdict === 'unsupported') {
      cleaned.assertion_status = 'needs_review'
      warnings.add(
        `Evidence for ${cleaned.id} does not support the claim's meaning.`,
      )
      trace.push({
        step: 'semantic_support',
        action: 'flagged',
        entity_id: entity.id,
        fact_id: cleaned.id,
        detail: 'Quote is at the cited location but does not support the meaning.',
        before: fact.value,
        after: cleaned.value,
      })
    }
  }

  if (isCalendarPresent(cleaned.value) && cleaned.key === 'end_date') {
    addQuestion(
      profile,
      entity.id,
      'end_date',
      'The source says the role is ongoing. Confirm there is no end date.',
      cleaned.evidence_ids,
    )
    return [
      {
        ...cleaned,
        id: `${cleaned.id}_status`,
        key: 'completion_status',
        value: 'ongoing',
        assertion_status: 'extracted',
      },
    ]
  }

  const range = explicitDateRange(quoteText)
  if (cleaned.key === 'end_date' && range?.ongoing) {
    trace.push({
      step: 'date_normalization',
      action: 'changed',
      entity_id: entity.id,
      fact_id: cleaned.id,
      detail: 'Range ending in Present is ongoing status, not an end date.',
      before: cleaned.value,
      after: 'ongoing',
    })
    return [
      {
        ...cleaned,
        id: `${cleaned.id}_status`,
        key: 'completion_status',
        value: 'ongoing',
        assertion_status: 'extracted',
      },
    ]
  }
  const role = dateRole(quoteText)
  const rangeKeepsRole =
    (cleaned.key === 'start_date' && range?.start) ||
    (cleaned.key === 'end_date' && range?.end) ||
    cleaned.key === 'expected_end_date'
  if (
    !rangeKeepsRole &&
    (cleaned.key === 'start_date' || cleaned.key === 'end_date') &&
    role === 'listed'
  ) {
    cleaned.key = 'listed_date'
    cleaned.assertion_status = 'needs_review'
    addQuestion(
      profile,
      entity.id,
      'listed_date',
      'A date is listed without saying whether it is a start or an end. Which does it mean?',
      cleaned.evidence_ids,
    )
    warnings.add(`Stored ${fact.key} as listed_date on ${entity.id}.`)
    trace.push({
      step: 'date_normalization',
      action: 'changed',
      entity_id: entity.id,
      fact_id: cleaned.id,
      detail: 'Standalone date has no start or end meaning.',
      before: fact.key,
      after: 'listed_date',
    })
  }

  if (cleaned.key === 'completed_coursework' && !/\b(completed|passed|finished|earned)\b/i.test(quoteText)) {
    cleaned.key = 'listed_coursework'
    cleaned.assertion_status = 'needs_review'
    warnings.add(`Coursework on ${entity.id} is listed, not completed.`)
  }

  if (cleaned.key === 'public_disclosure' && !/\b(disclos|permission|authorized)\b/i.test(quoteText)) {
    cleaned.key = 'source_platform'
    cleaned.assertion_status = 'needs_review'
    warnings.add(`Platform mention on ${entity.id} is not disclosure permission.`)
  }

  if (cleaned.key === 'related_experience_id' || cleaned.key === 'proposed_related_experience_id') {
    return rewriteRelationship(entity, cleaned, quoteText, profile, warnings, trace)
  }

  if (cleaned.key === 'name' && placementPhrase(quoteText)) {
    const phrase = placementPhrase(quoteText) as string
    if (typeof cleaned.value !== 'string' || !quoteText.toLowerCase().includes(cleaned.value.toLowerCase())) {
      cleaned.value = phrase
      cleaned.assertion_status = 'needs_review'
      addQuestion(
        profile,
        entity.id,
        'name',
        'The resume states a placement but not the official event name. What was the event called?',
        cleaned.evidence_ids,
      )
      warnings.add(`Did not invent an award name on ${entity.id}.`)
    }
  }

  if (isManagementClaim(cleaned.key) && /\bresearch/i.test(quoteText) && !/\bmanaged\b/i.test(quoteText)) {
    cleaned.key = 'research_context'
    cleaned.assertion_status = 'needs_review'
    warnings.add(`Portfolio research on ${entity.id} was not treated as personal management.`)
  }

  if (cleaned.key === 'tools_used') {
    return [alignToolsFact(cleaned, quotes, warnings)]
  }

  return [cleaned]
}

function rewriteRelationship(
  entity: EntityRecord,
  fact: FactRecord,
  quoteText: string,
  profile: ProfileRecord,
  warnings: Set<string>,
  trace: FactChange[],
): FactRecord[] {
  const organization = organizationForExperience(profile, String(fact.value ?? ''))
  const explicit =
    organization !== null &&
    quoteText.toLowerCase().includes(organization.toLowerCase()) &&
    /\b(during|while (working|employed)|as part of|in (this|my) role|internship)\b/i.test(
      quoteText,
    )
  if (explicit) {
    return [fact]
  }

  warnings.add(
    `Did not assert related_experience_id on ${entity.id}; the source does not explicitly connect the records.`,
  )
  trace.push({
    step: 'relationship',
    action: 'removed',
    entity_id: entity.id,
    fact_id: fact.id,
    detail: 'Unsupported relationship removed from facts and kept as a review question.',
    before: fact.value,
  })
  addQuestion(
    profile,
    entity.id,
    'related_experience_id',
    'Is this project part of a specific job, or only associated with the organization?',
    fact.evidence_ids,
  )
  const withOrg = /\bwith\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/.exec(quoteText)
  if (!withOrg) {
    return []
  }
  return [
    {
      ...fact,
      id: `${fact.id}_org`,
      key: 'associated_organization',
      value: withOrg[1],
      assertion_status: 'extracted',
    },
  ]
}

function alignToolsFact(
  fact: FactRecord,
  quotes: EvidenceRecord[],
  warnings: Set<string>,
): FactRecord {
  const quoteText = quotes.map((quote) => quote.quote).join('\n')
  const names = [...new Set(toolNames(fact.value).map((name) => name.toLowerCase()))]
  const kept: string[] = []
  const dropped: string[] = []
  for (const name of names) {
    const display = toolNames(fact.value).find((item) => item.toLowerCase() === name) ?? name
    if (isAcceptedTool(display, quoteText)) {
      kept.push(display)
    } else {
      dropped.push(display)
    }
  }
  if (dropped.length > 0) {
    warnings.add(
      `Dropped non-tools on ${fact.id}: ${dropped.join(', ')}.`,
    )
  }
  fact.value = kept.map((name) => ({
    name,
    kind: TOOL_KINDS[name.toLowerCase()] ?? 'unspecified',
  }))
  return fact
}

function containsPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i').test(text)
}

function metricLabel(value: unknown): string {
  if (!value || typeof value !== 'object' || !('metric' in value)) {
    return ''
  }
  const label = (value as { metric?: unknown }).metric
  return typeof label === 'string' ? label : ''
}

const CLASSIFICATION_KEYS = new Set(['category', 'kind'])
const SKILL_CATEGORIES = new Set([
  'programming_language',
  'library',
  'service',
  'method',
  'unspecified',
])
const LABEL_STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'by',
  'per',
  'over',
  'and',
  'or',
  'to',
  'in',
  'for',
  'with',
  'from',
  'on',
  'at',
])

const MUST_BE_QUOTED = new Set([
  'supervised',
  'supervise',
  'managed',
  'manage',
  'led',
  'lead',
  'owned',
  'own',
  'directed',
  'direct',
  'oversaw',
  'oversee',
  'budget',
  'budgeted',
  'revenue',
  'profit',
  'salary',
  'headcount',
])

function metricLabelSupported(quote: string, value: unknown): boolean {
  const label = metricLabel(value)
  if (!label) {
    return true
  }
  const words = contentWords(label)
  if (words.length === 0) {
    return true
  }
  const missing = words.filter((word) => !wordInQuote(word, quote))
  if (missing.length === 0) {
    return true
  }
  if (missing.some((word) => mustBeQuoted(word))) {
    return false
  }
  return words.some((word) => wordInQuote(word, quote))
}

function mustBeQuoted(word: string): boolean {
  const stem = word.replace(/(ing|ed|es|s)$/i, '')
  for (const required of MUST_BE_QUOTED) {
    if (word === required || stem === required || (stem.length >= 5 && required.startsWith(stem))) {
      return true
    }
  }
  return false
}

function contentWords(label: string): string[] {
  return (label.toLowerCase().match(/[a-z][a-z0-9+]*/g) ?? []).filter(
    (word) => word.length > 2 && !LABEL_STOP_WORDS.has(word),
  )
}

function wordInQuote(word: string, quote: string): boolean {
  const tokens = quote.toLowerCase().match(/[a-z][a-z0-9+]*/g) ?? []
  return tokens.some((token) => sharesStem(word, token))
}

function sharesStem(word: string, token: string): boolean {
  if (word === token) {
    return true
  }
  const left = word.replace(/(ing|ed|es|s)$/i, '')
  const right = token.replace(/(ing|ed|es|s)$/i, '')
  if (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left))) {
    return true
  }
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
    prefix += 1
  }
  return prefix >= 5
}

function keepResolvedMetric(
  entity: EntityRecord,
  fact: FactRecord,
  quote: string,
  profile: ProfileRecord,
  warnings: Set<string>,
  trace: FactChange[],
): boolean {
  if (metricLabelSupported(quote, fact.value)) {
    return true
  }
  const amount = metricAmountPhrase(fact.value)
  if (!amount || !fact.value || typeof fact.value !== 'object') {
    warnings.add(`Dropped unsupported metric claim on ${fact.id}.`)
    trace.push({
      step: 'metric_meaning',
      action: 'removed',
      entity_id: entity.id,
      fact_id: fact.id,
      detail: 'Metric label is not stated in the evidence quote.',
      before: fact.value,
    })
    return false
  }
  const record = { ...(fact.value as Record<string, unknown>) }
  const before = fact.value
  delete record.metric
  record.meaning_status = 'unresolved'
  fact.value = record
  fact.assertion_status = 'needs_review'
  addQuestion(
    profile,
    entity.id,
    'outcome_metric',
    `The resume states ${amount}. What does that figure represent?`,
    fact.evidence_ids,
  )
  warnings.add(`Metric label on ${fact.id} is not in the evidence. The amount is kept with unresolved meaning.`)
  trace.push({
    step: 'metric_meaning',
    action: 'changed',
    entity_id: entity.id,
    fact_id: fact.id,
    detail: 'Preserved the amount and left its meaning unresolved.',
    before,
    after: record,
  })
  return true
}

function metricAmountPhrase(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const record = value as { value?: unknown; unit?: unknown; multiplier?: unknown }
  const parts = [record.value, record.unit, record.multiplier].filter(
    (part) => typeof part === 'number' || (typeof part === 'string' && part.trim().length > 0),
  )
  return parts.length > 0 ? parts.map(String).join(' ') : null
}

function noteUnspecifiedAccuracy(entity: EntityRecord, profile: ProfileRecord): void {
  for (const fact of entity.facts) {
    if (fact.key !== 'outcome_metric' || !fact.value || typeof fact.value !== 'object') {
      continue
    }
    const metric = fact.value as Record<string, unknown>
    const quote = quotesFor(fact, profile)
      .map((item) => item.quote)
      .join('\n')
    const aboutAccuracy =
      metric.metric === 'accuracy' ||
      metric.accuracy_definition === 'unspecified' ||
      (metric.unit === 'percent' && /\baccurac/i.test(quote))
    if (!aboutAccuracy || !/\d/.test(quote)) {
      continue
    }
    if (/\b(measured|defined|test set|dataset|holdout|cross-validation)\b/i.test(quote)) {
      continue
    }
    metric.accuracy_definition = 'unspecified'
    metric.measurement_method = 'unspecified'
    const alreadyAsked = profile.open_questions.some(
      (question) =>
        /accurac/i.test(question.question) &&
        (question.entity_id === entity.id ||
          question.entity_id === fact.id ||
          question.evidence_ids.some((id) => fact.evidence_ids.includes(id))),
    )
    if (!alreadyAsked) {
      addQuestion(
        profile,
        entity.id,
        'outcome_metric',
        'The resume states an accuracy percentage but not how accuracy was defined or measured. How was it measured?',
        fact.evidence_ids,
      )
    }
  }
}

function resolveQuestionEntities(
  profile: ProfileRecord,
  warnings: Set<string>,
  trace: FactChange[],
): void {
  const entities = allEntities(profile)
  const person = profile.person as EntityRecord | undefined
  if (person?.id) {
    entities.push(person)
  }
  const entityIds = new Set(entities.map((entity) => entity.id))
  const factOwner = new Map<string, string>()
  for (const entity of entities) {
    for (const fact of entity.facts ?? []) {
      factOwner.set(fact.id, entity.id)
    }
  }
  for (const question of profile.open_questions) {
    const reference = question.entity_id
    if (reference && entityIds.has(reference)) {
      continue
    }
    const owner = reference ? factOwner.get(reference) : undefined
    if (owner) {
      question.entity_id = owner
      trace.push({
        step: 'question_entity',
        action: 'changed',
        entity_id: owner,
        fact_id: reference ?? '',
        detail: 'Question referenced a fact id and now references that fact’s entity.',
      })
      continue
    }
    warnings.add(`Question ${question.id} entity reference does not resolve.`)
    question.entity_id = null
  }
}

function sameMetricValue(left: unknown, right: unknown): boolean {
  const a = metricNumeric(left)
  const b = metricNumeric(right)
  return a !== null && b !== null && Math.abs(a - b) < 1e-9
}

function metricNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }
  if (!value || typeof value !== 'object' || !('value' in value)) {
    return null
  }
  const inner = (value as { value?: unknown }).value
  if (typeof inner === 'number') {
    return inner
  }
  if (typeof inner === 'string') {
    const match = /(\d+(?:\.\d+)?)/.exec(inner)
    return match ? Number(match[1]) : null
  }
  return null
}

function allEntities(profile: ProfileRecord): EntityRecord[] {
  return ENTITY_KEYS.flatMap((key) => {
    const value = profile[key]
    return Array.isArray(value) ? (value as EntityRecord[]) : []
  })
}

function restoreRangeDates(
  entity: EntityRecord,
  profile: ProfileRecord,
  trace: FactChange[],
): void {
  for (const fact of entity.facts) {
    if (fact.key !== 'listed_date' && fact.key !== 'end_date') {
      continue
    }
    const quote = quotesFor(fact, profile)
      .map((item) => item.quote)
      .join('\n')
    const range = explicitDateRange(quote)
    if (!range) {
      continue
    }
    const sides = monthYearValues(quote)
    const value = String(fact.value)
    if (fact.key === 'listed_date' && value === sides[0]) {
      fact.key = 'start_date'
      fact.assertion_status = 'extracted'
      trace.push({
        step: 'date_normalization',
        action: 'changed',
        entity_id: entity.id,
        fact_id: fact.id,
        detail: 'Restored the start of an explicit date range.',
        after: value,
      })
    } else if (fact.key === 'listed_date' && !range.ongoing && value === sides[1]) {
      fact.key = 'end_date'
      fact.assertion_status = 'extracted'
      trace.push({
        step: 'date_normalization',
        action: 'changed',
        entity_id: entity.id,
        fact_id: fact.id,
        detail: 'Restored the end of an explicit date range.',
        after: value,
      })
    } else if (range.ongoing && (fact.key === 'end_date' || isCalendarPresent(fact.value))) {
      fact.key = 'completion_status'
      fact.value = 'ongoing'
      fact.assertion_status = 'extracted'
    }
  }
}

function monthYearValues(quote: string): string[] {
  const found: string[] = []
  for (const match of quote.matchAll(/\b([A-Za-z]+)\s+(\d{4})\b/g)) {
    const month = MONTHS[match[1].toLowerCase()]
    if (month) {
      found.push(`${match[2]}-${month}`)
    }
  }
  return found
}

function dropDuplicateVolunteerExperience(
  profile: ProfileRecord,
  trace: FactChange[],
): void {
  const volunteerOrgs = new Set(
    profile.volunteering.flatMap((entity) =>
      entity.facts
        .filter((fact) => fact.key === 'organization')
        .map((fact) => String(fact.value).toLowerCase()),
    ),
  )
  profile.experience = profile.experience.filter((entity) => {
    const title = entity.facts.find((fact) => fact.key === 'title')?.value
    const organization = entity.facts.find((fact) => fact.key === 'organization')?.value
    const duplicate =
      typeof title === 'string' &&
      /\bvolunteer\b/i.test(title) &&
      typeof organization === 'string' &&
      volunteerOrgs.has(organization.toLowerCase())
    if (!duplicate) {
      return true
    }
    trace.push({
      step: 'duplicate_experience',
      action: 'removed',
      entity_id: entity.id,
      fact_id: entity.id,
      detail: 'Removed an experience row that repeats a volunteering record.',
    })
    return false
  })
}

function recomputeSingleValueConflicts(profile: ProfileRecord): void {
  profile.conflicts = []
  for (const entity of allEntities(profile)) {
    for (const conflict of singleValueConflicts(entity.id, entity.facts)) {
      addConflict(profile, conflict)
    }
  }
}

function isAcceptedTool(name: string, quote: string): boolean {
  const key = name.toLowerCase()
  if (!containsPhrase(quote, key)) {
    return false
  }
  if (TOOL_KINDS[key] || /\bAPI\b/i.test(name)) {
    return true
  }
  if (/[–—-]/.test(name)) {
    return false
  }
  return /\b(using|used|with|via)\s+[^.\n]{0,40}$/i.test(
    quote.slice(0, quote.toLowerCase().indexOf(key) + key.length),
  ) && !/\b(codes?|writing|based|orthogonality)\b/i.test(name)
}

function harvestProjectTools(
  project: EntityRecord,
  sources: ResumeInputSource[],
  profile: ProfileRecord,
  warnings: Set<string>,
  trace: FactChange[],
): void {
  const nameFact = project.facts.find((fact) => fact.key === 'name')
  const projectName = typeof nameFact?.value === 'string' ? nameFact.value : ''
  if (!projectName) {
    return
  }
  const blocks = blocksForProject(projectName, sources)
  const mentions = mentionsInBlocks(blocks)
  if (mentions.length === 0) {
    return
  }

  let toolsFact = project.facts.find((fact) => fact.key === 'tools_used')
  const existing = new Set(toolNames(toolsFact?.value).map((name) => name.toLowerCase()))
  const evidenceIds = new Set(toolsFact?.evidence_ids ?? [])

  for (const mention of mentions) {
    const evidenceId = ensureEvidence(profile, mention)
    evidenceIds.add(evidenceId)
    if (!existing.has(mention.name.toLowerCase())) {
      existing.add(mention.name.toLowerCase())
      warnings.add(`Added source-named tool ${mention.name} on ${project.id}.`)
      trace.push({
        step: 'tool_harvest',
        action: 'added',
        entity_id: project.id,
        fact_id: toolsFact?.id ?? `${project.id}_tools`,
        detail: `Added named tool ${mention.name} from a project block.`,
        after: mention.name,
      })
    }
  }

  const value = [...existing].map((name) => {
    const original = mentions.find((mention) => mention.name.toLowerCase() === name)?.name ?? name
    return { name: original, kind: TOOL_KINDS[name] ?? 'unspecified' }
  })

  if (!toolsFact) {
    toolsFact = {
      id: `${project.id}_tools`,
      key: 'tools_used',
      value,
      assertion_status: 'extracted',
      evidence_ids: [...evidenceIds],
      confirmation_evidence_id: null,
      confirmed_by: null,
      confirmed_at: null,
    }
    project.facts.push(toolsFact)
    return
  }
  toolsFact.value = value
  toolsFact.evidence_ids = [...evidenceIds]
}

function separateMetrics(
  entity: EntityRecord,
  profile: ProfileRecord,
  trace: FactChange[],
): void {
  const textFacts = entity.facts.filter(
    (fact) => typeof fact.value === 'string' && fact.key !== 'outcome_metric',
  )
  for (const fact of textFacts) {
    const text = String(fact.value)
    metricsFromText(text).forEach((extracted, index) => {
      const already = entity.facts.some(
        (other) => other.key === 'outcome_metric' && sameMetricValue(other.value, extracted.value),
      )
      if (already) {
        return
      }
      trace.push({
        step: 'metric_split',
        action: 'added',
        entity_id: entity.id,
        fact_id: `${fact.id}_metric_${index}`,
        detail: 'Split an explicit metric out of a prose fact.',
        after: extracted.value,
      })
      entity.facts.push({
        id: `${fact.id}_metric_${index}`,
        key: 'outcome_metric',
        value: extracted,
        assertion_status: 'extracted',
        evidence_ids: [...fact.evidence_ids],
        confirmation_evidence_id: null,
        confirmed_by: null,
        confirmed_at: null,
      })
      if (extracted.accuracy_definition === 'unspecified') {
        addQuestion(
          profile,
          entity.id,
          'outcome_metric',
          'The resume states an accuracy percentage but not how accuracy was defined. How was it measured?',
          fact.evidence_ids,
        )
      }
    })
  }
}

function metricsFromText(text: string): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = []
  for (const match of text.matchAll(/\bAUC\s+of\s+(\d+(?:\.\d+)?)/gi)) {
    found.push(metricObject(windowAround(text, match.index ?? 0), Number(match[1]), 'AUC'))
  }
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    const nearby = windowAround(text, match.index ?? 0)
    const object = metricObject(nearby, Number(match[1]), 'percent')
    if (/\baccurate\b/i.test(nearby)) {
      object.accuracy_definition = 'unspecified'
    }
    if (/\balpha\b/i.test(nearby)) {
      object.measure = 'out_of_sample_alpha'
      object.realized_return = false
    }
    found.push(object)
  }
  for (const match of text.matchAll(/(\d+)\s*\+/g)) {
    const nearby = windowAround(text, match.index ?? 0)
    if (!/\b(source|integration)/i.test(nearby)) {
      continue
    }
    found.push({
      ...metricObject(nearby, Number(match[1]), 'count'),
      approximation: 'lower_bound',
    })
  }
  return found
}

function windowAround(text: string, index: number): string {
  return text.slice(Math.max(0, index - 48), index + 48)
}

function metricObject(
  text: string,
  value: number,
  unit: string,
): Record<string, unknown> {
  return {
    statement: text,
    value,
    unit,
    approximation: /\b(about|approximately|approx\.?|~)/i.test(text),
    projected: /\b(potential|projected|expected)\b/i.test(text),
    annualized: /\bannual\b/i.test(text),
    method: null,
    sample_size: null,
    baseline: null,
    dataset: null,
  }
}

function reconcileRelationshipWarnings(
  profile: ProfileRecord,
  warnings: Set<string>,
  trace: FactChange[],
): void {
  const warningText = [...warnings].join('\n').toLowerCase()
  if (!warningText.includes('uncertain') && !warningText.includes('not assert')) {
    return
  }
  for (const project of profile.projects) {
    for (const fact of project.facts) {
      if (fact.key === 'related_experience_id' && fact.assertion_status === 'extracted') {
        trace.push({
          step: 'relationship',
          action: 'removed',
          entity_id: project.id,
          fact_id: fact.id,
          detail: 'Removed a relationship that the report already called uncertain.',
          before: fact.value,
        })
        fact.key = 'removed_relationship'
        fact.assertion_status = 'withdrawn'
        fact.value = null
      }
    }
  }
}

function blocksForProject(
  projectName: string,
  sources: ResumeInputSource[],
): ToolMention[] {
  const mentions: ToolMention[] = []
  for (const source of sources) {
    let capturing = false
    for (const block of source.blocks) {
      const namesThisProject = containsPhrase(block.text, projectName)
      if (!capturing) {
        if (!namesThisProject) {
          continue
        }
        capturing = true
      } else if (isDifferentEntry(block.text, projectName)) {
        break
      }
      mentions.push(...mentionsInBlock(source.source_id, block))
    }
  }
  return mentions
}

function isDifferentEntry(text: string, projectName: string): boolean {
  if (containsPhrase(text, projectName)) {
    return false
  }
  if (explicitDateRange(text)) {
    return true
  }
  if (/\bvolunteer\b/i.test(text)) {
    return true
  }
  return /\s\|\s/.test(text)
}

function mentionsInBlocks(mentions: ToolMention[]): ToolMention[] {
  const seen = new Set<string>()
  return mentions.filter((mention) => {
    const key = mention.name.toLowerCase()
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function mentionsInBlock(sourceId: string, block: ResumeSourceBlock): ToolMention[] {
  const found: ToolMention[] = []
  const lower = block.text.toLowerCase()
  for (const tool of NAMED_TOOLS) {
    if (containsPhrase(lower, tool)) {
      found.push({
        name: displayTool(tool, block.text),
        kind: TOOL_KINDS[tool],
        locator: block.locator,
        quote: block.text,
        source_id: sourceId,
      })
    }
  }
  return found
}

function displayTool(kindKey: string, text: string): string {
  const pattern = new RegExp(kindKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return pattern.exec(text)?.[0] ?? kindKey
}

function ensureEvidence(profile: ProfileRecord, mention: ToolMention): string {
  const existing = profile.evidence.find(
    (item) => item.locator === mention.locator && item.quote === mention.quote,
  )
  if (existing) {
    return existing.id
  }
  const id = `evidence_${mention.locator.replace(/\W+/g, '_')}`
  profile.evidence.push({
    id,
    source_id: mention.source_id,
    locator: mention.locator,
    quote: mention.quote,
  })
  return id
}

function quotesFor(fact: FactRecord, profile: ProfileRecord): EvidenceRecord[] {
  return (fact.evidence_ids ?? [])
    .map((id) => profile.evidence.find((item) => item.id === id))
    .filter((item): item is EvidenceRecord => Boolean(item))
}

function quoteOccursAtLocator(
  evidence: EvidenceRecord,
  sources: Map<string, ResumeInputSource>,
): boolean {
  const source = sources.get(evidence.source_id)
  const block = source?.blocks.find((item) => item.locator === evidence.locator)
  if (!block) {
    return false
  }
  return punctuationNormalized(block.text).includes(punctuationNormalized(evidence.quote))
}

function punctuationNormalized(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function looseText(value: string): string {
  return punctuationNormalized(value).replace(/["']/g, '').toLowerCase()
}

function supportVerdict(
  key: string,
  value: unknown,
  quote: string,
): 'quoted' | 'normalized' | 'unsupported' {
  if (key === 'completion_status' && value === 'ongoing') {
    return /\b(present|current|now|ongoing)\b/i.test(quote) ? 'normalized' : 'unsupported'
  }
  if (key === 'end_date' && isCalendarPresent(value)) {
    return /\b(present|current|now)\b/i.test(quote) ? 'normalized' : 'unsupported'
  }
  if (key === 'related_experience_id' || key === 'supporting_project_ids') {
    return 'normalized'
  }
  if (CLASSIFICATION_KEYS.has(key)) {
    return typeof value === 'string' && SKILL_CATEGORIES.has(value) ? 'normalized' : 'unsupported'
  }
  if (key === 'tools_used') {
    const names = toolNames(value)
    if (names.length === 0) {
      return 'quoted'
    }
    const present = names.every((name) => quote.toLowerCase().includes(name.toLowerCase()))
    return present ? 'normalized' : 'unsupported'
  }
  if (key === 'outcome_metric') {
    return metricSupported(quote, value) ? 'normalized' : 'unsupported'
  }
  if (typeof value === 'number') {
    if (quote.includes(String(value))) {
      return 'quoted'
    }
    return numberSupported(quote, value) ? 'normalized' : 'unsupported'
  }
  if (typeof value === 'string') {
    const quoted = looseText(quote)
    const claimed = looseText(value)
    if (quoted.includes(claimed)) {
      return quote.includes(value) ? 'quoted' : 'normalized'
    }
    return dateSupported(quote, value) ? 'normalized' : 'unsupported'
  }
  if (typeof value === 'boolean' || value === null) {
    return 'normalized'
  }
  if (Array.isArray(value)) {
    return value.every((item) => supportVerdict(key, item, quote) !== 'unsupported')
      ? 'normalized'
      : 'unsupported'
  }
  return 'unsupported'
}

function metricSupported(quote: string, value: unknown): boolean {
  if (typeof value === 'string') {
    return quote.includes(value) || numberSupported(quote, Number(value.replace('%', '')))
  }
  if (typeof value === 'number') {
    return numberSupported(quote, value)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const metric = value as {
    value?: unknown
    statement?: unknown
    metric?: unknown
    multiplier?: unknown
    meaning_status?: unknown
  }
  if (typeof metric.statement === 'string' && looseText(quote).includes(looseText(metric.statement))) {
    return true
  }
  if (typeof metric.metric === 'string' && metricLabelSupported(quote, value)) {
    if (typeof metric.multiplier !== 'string' || wordInQuote(metric.multiplier, quote)) {
      return true
    }
  }
  if (typeof metric.multiplier === 'string' && wordInQuote(metric.multiplier, quote)) {
    return true
  }
  if (metric.meaning_status === 'unresolved') {
    if (typeof metric.value === 'number') {
      return numberSupported(quote, metric.value)
    }
    if (typeof metric.value === 'string') {
      return looseText(quote).includes(looseText(metric.value)) || numberSupported(quote, metricNumeric(metric.value) ?? Number.NaN)
    }
  }
  if (typeof metric.value === 'number') {
    return numberSupported(quote, metric.value)
  }
  if (typeof metric.value === 'string') {
    return looseText(quote).includes(looseText(metric.value))
  }
  return false
}

function numberSupported(quote: string, value: number): boolean {
  if (!Number.isFinite(value)) {
    return false
  }
  const compact = quote.replace(/(\d),(?=\d)/g, '$1')
  const tokens = compact.match(/\d*\.\d+|\d+(?:\.\d+)?[kKmM]?/g) ?? []
  return tokens.some((token) =>
    numericCandidates(token).some((candidate) => Math.abs(candidate - value) < 1e-9),
  )
}

function numericCandidates(token: string): number[] {
  const match = /^(\d*\.\d+|\d+)([kKmM])?$/.exec(token)
  if (!match) {
    return []
  }
  const base = Number(match[1].startsWith('.') ? `0${match[1]}` : match[1])
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'm') {
    return [base, base * 1_000_000]
  }
  if (suffix === 'k') {
    return [base, base * 1_000]
  }
  return [base]
}

function explicitDateRange(quote: string): { start: boolean; end: boolean; ongoing: boolean } | null {
  const match =
    /\b[A-Za-z]+\s+\d{4}\s*[–—-]\s*(Present|Current|Now|[A-Za-z]+\s+\d{4})\b/i.exec(quote)
  if (!match) {
    return null
  }
  const ongoing = /^(present|current|now)$/i.test(match[1])
  return { start: true, end: !ongoing, ongoing }
}

function dateSupported(quote: string, value: string): boolean {
  for (const match of quote.matchAll(/\b([A-Za-z]+)\s+(\d{4})\b/g)) {
    const month = MONTHS[match[1].toLowerCase()]
    if (!month) {
      continue
    }
    if (value === match[2] || value === `${match[2]}-${month}`) {
      return true
    }
  }
  return false
}

function dedupeQuestions(profile: ProfileRecord, trace: FactChange[]): void {
  const seen = new Set<string>()
  const before = profile.open_questions.length
  profile.open_questions = profile.open_questions.filter((question) => {
    const key = `${question.entity_id}|${question.field_key}|${question.question}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
  if (profile.open_questions.length !== before) {
    trace.push({
      step: 'question_dedupe',
      action: 'removed',
      entity_id: '',
      fact_id: '',
      detail: `Removed ${before - profile.open_questions.length} duplicate review questions.`,
    })
  }
}

function dateRole(quote: string): 'start' | 'end' | 'expected' | 'ongoing' | 'listed' {
  if (/\bexpected\b/i.test(quote)) {
    return 'expected'
  }
  if (/\b(present|current|ongoing)\b/i.test(quote) && !/\b(through|until|ended)\b/i.test(quote)) {
    return 'ongoing'
  }
  if (/\b(through|until|ended)\b/i.test(quote)) {
    return 'end'
  }
  if (/\b(since|from|started)\b/i.test(quote)) {
    return 'start'
  }
  return 'listed'
}

function isCalendarPresent(value: unknown): boolean {
  return typeof value === 'string' && /^(present|current|now)$/i.test(value.trim())
}

function placementPhrase(quote: string): string | null {
  const match = /\b(placed\s+(?:first|second|third|\d(?:st|nd|rd|th)))\b/i.exec(quote)
  return match ? match[1] : null
}

function isManagementClaim(key: string): boolean {
  return /managed|aum|portfolio_size/i.test(key)
}

function organizationForExperience(profile: ProfileRecord, experienceId: string): string | null {
  const experience = profile.experience.find((item) => item.id === experienceId)
  const organization = experience?.facts.find((fact) => fact.key === 'organization')
  return typeof organization?.value === 'string' ? organization.value : null
}

function collapseToolFacts(
  entity: EntityRecord,
  profile: ProfileRecord,
  trace: FactChange[],
): void {
  const toolFacts = entity.facts.filter((fact) => fact.key === 'tools_used')
  if (toolFacts.length === 0) {
    return
  }
  const quote = toolFacts
    .flatMap((fact) => quotesFor(fact, profile).map((item) => item.quote))
    .join('\n')
  const names: string[] = []
  const evidenceIds = new Set<string>()
  for (const fact of toolFacts) {
    for (const evidenceId of fact.evidence_ids) {
      evidenceIds.add(evidenceId)
    }
    for (const name of toolNames(fact.value)) {
      if (!isAcceptedTool(name, quote)) {
        continue
      }
      if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
        names.push(name)
      }
    }
  }
  const value = names.map((name) => ({
    name,
    kind: TOOL_KINDS[name.toLowerCase()] ?? 'unspecified',
  }))
  const [first, ...rest] = toolFacts
  first.value = value
  first.evidence_ids = [...evidenceIds]
  if (rest.length > 0) {
    entity.facts = entity.facts.filter((fact) => !rest.includes(fact))
    trace.push({
      step: 'tool_shape',
      action: 'removed',
      entity_id: entity.id,
      fact_id: rest.map((fact) => fact.id).join(','),
      detail: 'Merged duplicate tools_used facts into one array of {name, kind}.',
      after: value,
    })
  }
}

function toolNames(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  const items = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []
  return items
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object') {
        const record = item as { name?: unknown; tool?: unknown; technology?: unknown }
        const name = record.name ?? record.tool ?? record.technology
        return typeof name === 'string' ? name : ''
      }
      return ''
    })
    .filter(Boolean)
}

function stripParserConfirmation(fact: FactRecord): FactRecord {
  if (fact.assertion_status !== 'confirmed') {
    return {
      ...fact,
      confirmation_evidence_id: null,
      confirmed_by: null,
      confirmed_at: null,
    }
  }
  return {
    ...fact,
    assertion_status: 'extracted',
    confirmation_evidence_id: null,
    confirmed_by: null,
    confirmed_at: null,
  }
}

function addQuestion(
  profile: ProfileRecord,
  entityId: string,
  fieldKey: string,
  question: string,
  evidenceIds: string[],
): void {
  profile.open_questions.push({
    id: `question_${profile.open_questions.length + 1}`,
    entity_id: entityId,
    field_key: fieldKey,
    question,
    reason: 'ambiguous',
    evidence_ids: evidenceIds,
    state: 'open',
  })
}

function addConflict(profile: ProfileRecord, conflict: FactKeyConflict): void {
  profile.conflicts.push({
    id: `conflict_${profile.conflicts.length + 1}`,
    entity_id: conflict.entity_id,
    field_key: conflict.field_key,
    fact_ids: conflict.fact_ids,
    description: conflict.description,
    state: 'open',
    resolution_evidence_id: null,
  })
}

export function factValuesByKey(facts: FactRecord[]): Map<string, unknown[]> {
  const grouped = groupFactsByKey(facts)
  return new Map([...grouped].map(([key, group]) => [key, group.map((fact) => fact.value)]))
}
