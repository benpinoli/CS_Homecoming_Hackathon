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

/**
 * Apply source-grounded checks to a parser proposal.
 * This is deterministic validation and repair, not a claim that extraction is complete.
 */
export function normalizeResumeExtraction(
  extraction: ResumeExtraction,
  request: ParseResumeApiRequest,
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
      normalizeEntity(entity, profile, sources, warnings)
    }
  }

  for (const project of profile.projects) {
    harvestProjectTools(project, request.sources, profile, warnings)
    separateMetrics(project, profile)
  }
  for (const job of profile.experience) {
    separateMetrics(job, profile)
  }

  reconcileRelationshipWarnings(profile, warnings)
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
): void {
  entity.facts = (entity.facts ?? []).flatMap((fact) =>
    normalizeFact(entity, fact, profile, sources, warnings),
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
  const located = quotes.filter((quote) => quoteOccursAtLocator(quote, sources))
  if (quotes.length === 0 || located.length !== quotes.length) {
    cleaned.assertion_status = 'needs_review'
    warnings.add(
      `Evidence for ${cleaned.id} is missing or is not verbatim at its locator.`,
    )
  } else if (!quotesSupportValue(quotes.map((item) => item.quote), cleaned.value)) {
    cleaned.assertion_status = 'needs_review'
    warnings.add(
      `Evidence text for ${cleaned.id} does not cover the full fact value.`,
    )
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

  const quoteText = quotes.map((item) => item.quote).join('\n')
  const role = dateRole(quoteText)
  if (
    (cleaned.key === 'start_date' ||
      cleaned.key === 'end_date' ||
      cleaned.key === 'expected_end_date') &&
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

  if (cleaned.key === 'related_experience_id') {
    return rewriteRelationship(entity, cleaned, quoteText, profile, warnings)
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

  if (cleaned.key === 'tools_used' && Array.isArray(cleaned.value)) {
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
  const proposed: FactRecord = {
    ...fact,
    key: 'proposed_related_experience_id',
    assertion_status: 'needs_review',
  }
  addQuestion(
    profile,
    entity.id,
    'related_experience_id',
    'Is this project part of a specific job, or only associated with the organization?',
    fact.evidence_ids,
  )
  const withOrg = /\bwith\s+([A-Z][\w&.-]*(?:\s+[A-Z][\w&.-]*)*)/.exec(quoteText)
  if (!withOrg) {
    return [proposed]
  }
  return [
    proposed,
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
  const names = toolNames(fact.value)
  const supported = names.filter((name) =>
    quotes.some((quote) => quote.quote.toLowerCase().includes(name.toLowerCase())),
  )
  const missing = names.filter((name) => !supported.includes(name))
  if (missing.length > 0) {
    fact.assertion_status = 'needs_review'
    warnings.add(
      `Dropped tools without evidence on ${fact.id}: ${missing.join(', ')}.`,
    )
  }
  fact.value = supported.map((name) => ({
    name,
    kind: TOOL_KINDS[name.toLowerCase()] ?? 'unspecified',
  }))
  return fact
}

function harvestProjectTools(
  project: EntityRecord,
  sources: ResumeInputSource[],
  profile: ProfileRecord,
  warnings: Set<string>,
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

function separateMetrics(entity: EntityRecord, profile: ProfileRecord): void {
  const textFacts = entity.facts.filter(
    (fact) => typeof fact.value === 'string' && fact.key !== 'outcome_metric',
  )
  for (const fact of textFacts) {
    const text = String(fact.value)
    metricsFromText(text).forEach((extracted, index) => {
      const already = entity.facts.some((other) => {
        if (other.key !== 'outcome_metric' || !other.value || typeof other.value !== 'object') {
          return false
        }
        return (other.value as { value?: unknown }).value === extracted.value
      })
      if (already) {
        return
      }
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
): void {
  const warningText = [...warnings].join('\n').toLowerCase()
  if (!warningText.includes('uncertain') && !warningText.includes('not assert')) {
    return
  }
  for (const project of profile.projects) {
    for (const fact of project.facts) {
      if (fact.key === 'related_experience_id' && fact.assertion_status === 'extracted') {
        fact.key = 'proposed_related_experience_id'
        fact.assertion_status = 'needs_review'
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
    let active = false
    for (const block of source.blocks) {
      if (/\b(technical skills|education|experience)\b/i.test(block.text) && !block.text.toLowerCase().includes(projectName.toLowerCase())) {
        active = false
        continue
      }
      if (isHeaderBlock(block) && !block.text.toLowerCase().includes(projectName.toLowerCase())) {
        active = false
      }
      if (block.text.toLowerCase().includes(projectName.toLowerCase())) {
        active = true
      }
      if (!active) {
        continue
      }
      mentions.push(...mentionsInBlock(source.source_id, block))
      if (isHeaderBlock(block) && !block.text.toLowerCase().includes(projectName.toLowerCase())) {
        break
      }
    }
  }
  return mentions
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
    if (lower.includes(tool)) {
      found.push({
        name: displayTool(tool, block.text),
        kind: TOOL_KINDS[tool],
        locator: block.locator,
        quote: block.text,
        source_id: sourceId,
      })
    }
  }
  const extra = block.text.match(/\b[a-z]{2,}-[a-z0-9]+(?:-[a-z0-9]+)*\b/g) ?? []
  for (const token of extra) {
    if (found.some((item) => item.name.toLowerCase() === token.toLowerCase())) {
      continue
    }
    found.push({
      name: token,
      kind: 'unspecified',
      locator: block.locator,
      quote: block.text,
      source_id: sourceId,
    })
  }
  return found
}

function displayTool(kindKey: string, text: string): string {
  const pattern = new RegExp(kindKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return pattern.exec(text)?.[0] ?? kindKey
}

function isHeaderBlock(block: ResumeSourceBlock): boolean {
  return /\s\|\s/.test(block.text) || /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i.test(block.text)
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
  return block.text.includes(evidence.quote)
}

function quotesSupportValue(quotes: string[], value: unknown): boolean {
  const blob = quotes.join('\n')
  if (typeof value === 'string') {
    return blob.includes(value) || dateSupported(blob, value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return blob.includes(String(value))
  }
  if (Array.isArray(value)) {
    return value.every((item) => quotesSupportValue(quotes, item))
  }
  if (value && typeof value === 'object') {
    return Object.values(value).every(
      (item) => item === null || quotesSupportValue(quotes, item),
    )
  }
  return false
}

function dateSupported(quote: string, value: string): boolean {
  const match = /\b([A-Za-z]+)\s+(\d{4})\b/.exec(quote)
  if (!match) {
    return false
  }
  const month = MONTHS[match[1].toLowerCase()]
  if (!month) {
    return false
  }
  return value === match[2] || value === `${match[2]}-${month}`
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

function toolNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object' && 'name' in item) {
        return String((item as { name: unknown }).name)
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
