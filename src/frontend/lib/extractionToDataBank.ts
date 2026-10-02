import type { ParsedResume, ResumeImport } from '../types'

/**
 * Turns the resume parser's evidence-backed `candidate_profile` (entities made of facts such as
 * `organization`, `title`, `personal_responsibilities`) into the flat fields the Data Bank stores.
 * Fact keys follow src/resume_field_conventions.ts and the example in resume_json_builder/resume_bank_kit.
 */

type Fact = { key: string; value: unknown; assertion_status?: string }
type Entity = { id?: string; facts?: Fact[] }

interface ExtractionLike {
  candidate_profile?: Record<string, unknown>
  extraction_report?: { warnings?: unknown; unmapped_passages?: unknown }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ONGOING = new Set(['in_progress', 'ongoing', 'current', 'active'])
const NOT_STARTED = new Set(['planned', 'not_started', 'idea', 'abandoned'])
const DEGREE_WORDS = /\b(bachelor|master|doctor|associate|diploma|certificate|degree|mba|ph\.?d|b\.?\s?[sa]\.?|m\.?\s?[sa]\.?|a\.?\s?[sa]\.?)\b/i

// ---------- small helpers ----------

const asEntities = (v: unknown): Entity[] => (Array.isArray(v) ? (v as Entity[]) : [])

/** Facts that are still in play (withdrawn or disputed ones are ignored) */
const activeFacts = (e: Entity): Fact[] =>
  (e.facts ?? []).filter((f) => f.value !== null && f.value !== undefined && !['withdrawn', 'disputed'].includes(f.assertion_status ?? ''))

const values = (e: Entity, key: string): unknown[] => activeFacts(e).filter((f) => f.key === key).map((f) => f.value)

const firstValue = (e: Entity, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = values(e, k)[0]
    if (v !== undefined) return v
  }
  return undefined
}

/** "programming_language" -> "Programming language" */
const prettify = (s: string) => {
  const t = s.replace(/_/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : ''
}

/** Readable text for a scalar, a small object, or a list */
function describe(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(describe).filter(Boolean).join(', ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const unit = typeof o.unit === 'string' ? ` ${o.unit}` : ''
    // Metrics arrive as { metric, value } (or { name, value }); show them as "what: how much"
    const what = typeof o.metric === 'string' ? o.metric : typeof o.name === 'string' ? o.name : ''
    if ('before' in o && 'after' in o) return `${what ? `${what}: ` : ''}${describe(o.before)} → ${describe(o.after)}${unit}`.trim()
    if ('value' in o) return `${what ? `${what}: ` : ''}${describe(o.value)}${unit}`.trim()
    // A tool like { name: "Python", kind: "programming_language" } is just its name
    if (what) return what
    return Object.entries(o).map(([k, val]) => `${prettify(k)}: ${describe(val)}`).join('; ')
  }
  return ''
}

/** Every value of a key as separate lines (arrays are flattened) */
const lines = (e: Entity, ...keys: string[]): string[] =>
  keys.flatMap((k) => values(e, k)).flatMap((v) => (Array.isArray(v) ? v : [v])).map(describe).filter(Boolean)

export function formatDate(v: unknown): string {
  const s = describe(v)
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (full) return `${MONTHS[Number(full[2]) - 1] ?? full[2]} ${Number(full[3])}, ${full[1]}`
  const month = /^(\d{4})-(\d{2})$/.exec(s)
  if (month) return `${MONTHS[Number(month[2]) - 1] ?? month[2]} ${month[1]}`
  return s
}

function formatLocation(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    const country = typeof o.country === 'string' && !/^(united states|usa|us)$/i.test(o.country.trim()) ? o.country : ''
    return [o.city, o.region, country].filter((x) => typeof x === 'string' && x).join(', ')
  }
  return describe(v)
}

/**
 * Start/end for a dated entity. An unfinished one ends "Present". A lone `listed_date` is the date the
 * resume shows: a graduation or award date, so it becomes the end (or the only date for other entries).
 */
function dateRange(e: Entity, listedIsEnd = false) {
  let start = formatDate(firstValue(e, 'start_date'))
  let end = formatDate(firstValue(e, 'end_date'))
  if (!end) {
    const expected = formatDate(firstValue(e, 'expected_end_date'))
    if (expected) end = `Expected ${expected}`
    else if (ONGOING.has(describe(firstValue(e, 'completion_status')).toLowerCase())) end = 'Present'
  }
  const listed = formatDate(firstValue(e, 'listed_date'))
  if (listed && !start && !end) {
    if (listedIsEnd) end = listed
    else start = listed
  }
  return { start, end }
}

/** Parser notes about how the text was read, not about the resume's content */
const TECHNICAL_NOTE = /\bOCR\b|spac(?:es|ing)|normali[sz]ed|artifact|typo|character|formatting|\bfact_\d+|\bevidence\b|verbatim|source-named|resume-only|no portfolio|\bAdded\b.*\btool\b|ambiguous date|incomplete project|\bunmapped\b|open question/i

const label = (e: Entity) => describe(firstValue(e, 'name', 'title', 'organization', 'institution', 'full_name')) || 'an entry'

// ---------- bullets from the resume's own words ----------

type Evidence = { id?: string; quote?: string }

/** Parser output indexed for lookups: evidence by id, and the correctly-spelled words the model used */
interface Context {
  evidence: Map<string, string>
  vocab: Set<string>
}

const wordsOf = (s: string) => s.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? []

function buildContext(profile: Record<string, unknown>): Context {
  const evidence = new Map<string, string>()
  for (const e of (Array.isArray(profile.evidence) ? profile.evidence : []) as Evidence[]) {
    if (e?.id && typeof e.quote === 'string') evidence.set(e.id, e.quote)
  }
  const vocab = new Set<string>()
  const collect = (v: unknown) => {
    if (typeof v === 'string') wordsOf(v).forEach((w) => vocab.add(w))
    else if (Array.isArray(v)) v.forEach(collect)
    else if (v && typeof v === 'object') Object.values(v).forEach(collect)
  }
  for (const [key, group] of Object.entries(profile)) {
    if (key === 'evidence' || key === 'sources') continue
    for (const e of (Array.isArray(group) ? group : [group]) as Entity[]) for (const f of e?.facts ?? []) collect(f.value)
  }
  return { evidence, vocab }
}

/** PDF text often breaks words ("Prov ided"); rejoin pieces when the model spelled the whole word elsewhere */
function repairText(text: string, vocab: Set<string>): string {
  const tokens = text
    .replace(/[\u2010-\u2015\u2212]/g, '-') // fancy hyphens and dashes
    .replace(/\s+([.,;:!?%)])/g, '$1')
    .replace(/(\w)- (?=[a-z])/g, '$1-') // "18- hour" -> "18-hour"
    .split(/\s+/)
    .filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i]
    const b = tokens[i + 1]
    if (b && /^[A-Za-z]+$/.test(a) && /^[A-Za-z]+[.,;:!?]?$/.test(b)) {
      const tail = b.replace(/[.,;:!?]$/, '')
      const whole = (a + tail).toLowerCase()
      if (vocab.has(whole) && !(vocab.has(a.toLowerCase()) && vocab.has(tail.toLowerCase()))) {
        out.push(a + b)
        i++
        continue
      }
    }
    out.push(a)
  }
  return out.join(' ')
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const stems = (s: string) => new Set(wordsOf(s).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)))

/** Is this quote the same statement as the model's summary of it? */
function matches(quote: string, value: string): boolean {
  if (quote.length < value.length * 0.8) return false
  const need = stems(value)
  if (need.size === 0) return false
  const have = stems(quote)
  let shared = 0
  need.forEach((w) => { if (have.has(w)) shared++ })
  return shared / need.size >= 0.5
}

/** Adds a bullet unless it repeats one already there; a fuller version replaces a shorter one */
function addBullet(list: string[], text: string) {
  const n = norm(text)
  if (n.length < 3) return
  for (let i = 0; i < list.length; i++) {
    const m = norm(list[i])
    if (m.includes(n)) return
    if (n.includes(m)) {
      list[i] = text
      return
    }
  }
  list.push(text)
}

/** A quote can be a whole paragraph; one bullet per sentence reads better */
const splitSentences = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((t) => t.trim()).filter(Boolean)

/** Removes a leading copy of the entry's own heading ("PNG Image Compression Tool Developed a ...") */
function withoutHeading(text: string, heading: string): string {
  const h = heading.trim()
  return h && text.toLowerCase().startsWith(h.toLowerCase()) ? text.slice(h.length).trim() : text
}

/**
 * Bullets for a description. The model paraphrases each bullet and splits its numbers into separate metrics,
 * but the evidence quotes keep the resume's own sentence, so those are preferred. Paraphrases are the fallback.
 */
function bulletsFor(
  e: Entity,
  ctx: Context,
  valueKeys: string[],
  metricKeys: string[] = ['outcome_metric'],
  heading = '',
): string[] {
  const out: string[] = []
  const add = (text: string) => splitSentences(withoutHeading(repairText(text, ctx.vocab), heading)).forEach((t) => addBullet(out, t))
  const quotesOf = (f: Fact & { evidence_ids?: string[] }) =>
    [...new Set((f.evidence_ids ?? []).map((id) => ctx.evidence.get(id)).filter((q): q is string => !!q))]

  for (const f of activeFacts(e) as Array<Fact & { evidence_ids?: string[] }>) {
    if (!valueKeys.includes(f.key)) continue
    const items = Array.isArray(f.value) ? f.value : [f.value]
    for (const item of items) {
      const value = describe(item)
      if (!value) continue
      const best = quotesOf(f).filter((q) => matches(q, value)).sort((x, y) => y.length - x.length)[0]
      add(best ?? value)
    }
  }

  for (const f of activeFacts(e) as Array<Fact & { evidence_ids?: string[] }>) {
    if (!metricKeys.includes(f.key)) continue
    const covered = (text: string) => out.some((b) => norm(b).includes(norm(text)))
    const sentence = quotesOf(f).find((q) => q.split(/\s+/).length >= 4)
    if (sentence) {
      if (!covered(repairText(sentence, ctx.vocab))) add(sentence)
    } else {
      const text = describe(f.value)
      if (text && !covered(text)) add(text)
    }
  }
  return out
}

// ---------- per-section mapping ----------

function mapPerson(person: Entity | undefined) {
  if (!person) return undefined
  const row: Record<string, string> = {
    name: describe(firstValue(person, 'full_name', 'name')),
    email: describe(firstValue(person, 'email')),
    phone: describe(firstValue(person, 'phone')),
    location: formatLocation(firstValue(person, 'location')),
    linkedin: '',
    website: '',
    summary: describe(firstValue(person, 'summary', 'professional_summary')),
  }
  // Any URL fact: LinkedIn goes to its own field, the first other one is the website
  for (const f of activeFacts(person)) {
    if (typeof f.value !== 'string' || !/^(https?:\/\/|www\.)|\.(com|org|net|io|dev)\b/i.test(f.value)) continue
    if (f.key === 'email') continue
    if (/linkedin/i.test(f.key + f.value)) row.linkedin ||= f.value
    else if (/url|website|portfolio|github|link/i.test(f.key)) row.website ||= f.value
  }
  return Object.values(row).some(Boolean) ? [row] : undefined
}

function mapExperience(e: Entity, ctx: Context) {
  const { start, end } = dateRange(e)
  const bullets = bulletsFor(e, ctx, ['personal_responsibilities', 'personal_contributions', 'activities'])
  return {
    company: describe(firstValue(e, 'organization', 'employer', 'company')),
    position: describe(firstValue(e, 'title', 'role', 'position')),
    location: formatLocation(firstValue(e, 'location')),
    startDate: start,
    endDate: end,
    description: bullets.join('\n'),
  }
}

function mapEducation(e: Entity) {
  const { start, end } = dateRange(e, true)
  const gpaRaw = firstValue(e, 'gpa')
  let gpa: string
  if (gpaRaw && typeof gpaRaw === 'object') {
    const g = gpaRaw as { value?: unknown; scale?: unknown }
    gpa = g.scale && Number(g.scale) !== 4 ? `${describe(g.value)}/${describe(g.scale)}` : describe(g.value)
  } else gpa = describe(gpaRaw)

  const done = lines(e, 'completed_coursework', 'listed_coursework')
  const inProgress = lines(e, 'in_progress_coursework')
  const details = [
    ...lines(e, 'honors', 'awards'),
    done.length ? `Coursework: ${done.join(', ')}` : '',
    inProgress.length ? `In progress: ${inProgress.join(', ')}` : '',
  ].filter(Boolean)

  let degree = describe(firstValue(e, 'degree'))
  let field = describe(firstValue(e, 'field', 'major', 'field_of_study'))
  // "Computer Science" with no degree type is a major, not a degree
  if (degree && !field && !DEGREE_WORDS.test(degree)) {
    field = degree
    degree = ''
  }
  return {
    school: describe(firstValue(e, 'institution', 'school', 'organization')),
    degree,
    field,
    location: formatLocation(firstValue(e, 'location')),
    startDate: start,
    endDate: end,
    gpa,
    details: details.join('\n'),
  }
}

/** Planned or abandoned work must not appear as something the person did */
function isPlanned(e: Entity) {
  const status = describe(firstValue(e, 'completion_status')).toLowerCase()
  const impl = describe(firstValue(e, 'implementation_status')).toLowerCase()
  return NOT_STARTED.has(status) || impl === 'no_code_written'
}

function mapProject(e: Entity, ctx: Context, role = '') {
  const { start, end } = dateRange(e)
  const bullets = bulletsFor(e, ctx, ['personal_contributions', 'personal_responsibilities', 'activities'], ['outcome_metric'], describe(firstValue(e, 'name', 'title')))
  const fallback = bullets.length === 0 ? lines(e, 'problem') : []
  return {
    name: describe(firstValue(e, 'name', 'title')),
    role: role || describe(firstValue(e, 'role')),
    technologies: lines(e, 'tools_used').join(', '),
    link: describe(firstValue(e, 'public_url', 'url', 'link')),
    startDate: start,
    endDate: end,
    description: [...bullets, ...fallback].join('\n'),
  }
}

function mapVolunteer(e: Entity, ctx: Context) {
  const { start, end } = dateRange(e)
  return {
    organization: describe(firstValue(e, 'organization')),
    role: describe(firstValue(e, 'role', 'title')),
    startDate: start,
    endDate: end,
    description: bulletsFor(e, ctx, ['activities', 'personal_responsibilities', 'personal_contributions']).join('\n'),
  }
}

// ---------- entry point ----------

export function extractionToResumeImport(extraction: ExtractionLike): ResumeImport {
  const profile = extraction.candidate_profile ?? {}
  const report = extraction.extraction_report ?? {}
  const warnings: string[] = []
  const data: ParsedResume = {}
  const ctx = buildContext(profile)

  const person = profile.person as Entity | undefined
  const profileRows = mapPerson(person)
  if (profileRows) data.profile = profileRows

  const experience = asEntities(profile.experience)
  data.experience = experience.map((e) => mapExperience(e, ctx)).filter((r) => r.company || r.position)

  const education = asEntities(profile.education)
  data.education = education.map(mapEducation).filter((r) => r.school || r.degree)

  // Projects, plus hackathons and similar events; anything only planned is skipped
  const projects: Array<Record<string, string>> = []
  for (const e of asEntities(profile.projects)) {
    if (isPlanned(e)) {
      warnings.push(`Skipped “${label(e)}” because it was only planned, not done.`)
      continue
    }
    projects.push(mapProject(e, ctx))
  }
  for (const e of asEntities(profile.other_experiences)) {
    if (isPlanned(e)) continue
    const row = mapProject(e, ctx, prettify(describe(firstValue(e, 'kind'))))
    row.startDate = formatDate(firstValue(e, 'event_date', 'start_date'))
    projects.push(row)
  }
  data.projects = projects.filter((r) => r.name)

  const skills: Array<Record<string, string>> = []
  for (const e of asEntities(profile.skills)) {
    const category = describe(firstValue(e, 'category'))
    skills.push({ name: describe(firstValue(e, 'name')), category: /^(unspecified|unknown|other|none|n\/a)$/i.test(category) ? '' : prettify(category) })
  }
  for (const e of asEntities(profile.languages)) {
    const native = describe(firstValue(e, 'native_language'))
    const extra = describe(firstValue(e, 'additional_language'))
    const level = describe(firstValue(e, 'additional_language_proficiency'))
    if (native) skills.push({ name: `${native} (native)`, category: 'Languages' })
    if (extra) skills.push({ name: level ? `${extra} (${level.replace(/_/g, ' ')})` : extra, category: 'Languages' })
  }
  data.skills = skills.filter((r) => r.name)

  data.volunteer = asEntities(profile.volunteering).map((e) => mapVolunteer(e, ctx)).filter((r) => r.organization || r.role)

  const certs: Array<Record<string, string>> = []
  for (const e of asEntities(profile.certifications)) {
    certs.push({ name: describe(firstValue(e, 'name')), issuer: describe(firstValue(e, 'issuer')), date: formatDate(firstValue(e, 'issued_date', 'date', 'listed_date')) })
  }
  for (const e of asEntities(profile.awards)) {
    certs.push({ name: describe(firstValue(e, 'name')), issuer: describe(firstValue(e, 'issuer')), date: formatDate(firstValue(e, 'awarded_date', 'date', 'listed_date')) })
  }
  data.certifications = certs.filter((r) => r.name)

  // Drop empty sections so the Data Bank only reports what was really found
  for (const key of Object.keys(data) as Array<keyof ParsedResume>) if (!data[key]?.length) delete data[key]

  // ---- things worth telling the user ----
  // The parser also reports OCR quirks, evidence checks and open questions. Those are for developers (the Demo tab
  // shows the full output), so only plain-language notes about the content itself get through.
  if (Array.isArray(report.warnings)) warnings.push(...(report.warnings as string[]).filter((w) => !TECHNICAL_NOTE.test(w)))
  const publications = asEntities(profile.publications).length
  if (publications) {
    warnings.push(
      publications === 1
        ? '1 publication wasn’t imported because the Data Bank has no section for it.'
        : `${publications} publications weren’t imported because the Data Bank has no section for them.`,
    )
  }

  return { data, warnings: [...new Set(warnings)] }
}
