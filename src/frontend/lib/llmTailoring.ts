import { tailorResume, type ScrapedJob, type TailorApiResponse } from './backend.ts'
import { confirmedFacts, type BankFact } from './experienceBank.ts'
import { keywordBank, pageEstimate, type BulletRecord, type GeneratedFromFacts } from './generateFromFacts.ts'
import { containsPhrase } from './requirementMatch.ts'
import type { GeneratedResume, TailoringPoint } from '../types'

interface ProfileEntity {
  id: string
  facts: Array<{ id: string; key: string; value: string; assertion_status: string }>
}

/** Facts regrouped into the profile shape llm_app reads: section -> entities -> facts. */
export function profileFromFacts(facts: BankFact[]): Record<string, ProfileEntity[]> {
  const profile: Record<string, ProfileEntity[]> = {}
  for (const fact of facts) {
    const entities = (profile[fact.section] ??= [])
    let entity = entities.find((item) => item.id === fact.entityId)
    if (!entity) {
      entity = { id: fact.entityId, facts: [] }
      entities.push(entity)
    }
    entity.facts.push({ id: fact.id, key: fact.key, value: fact.valueText, assertion_status: fact.assertion_status })
  }
  return profile
}

/**
 * Turn llm_app's tailored resume into the app's resume, keeping only what confirmed facts support:
 * bullets must cite confirmed fact ids, and skills must appear in some confirmed fact.
 * `base` (from generateFromConfirmedFacts) supplies the contact details.
 */
export function resumeFromTailoring(
  response: TailorApiResponse,
  facts: BankFact[],
  base: GeneratedResume,
  pageLimit: number,
): GeneratedFromFacts {
  const confirmed = confirmedFacts(facts)
  const known = new Set(confirmed.map((fact) => fact.id))
  const values = (entityId: string, key: string) =>
    confirmed.filter((fact) => fact.entityId === entityId && fact.key === key).map((fact) => fact.valueText)
  const value = (entityId: string, key: string) => values(entityId, key)[0] ?? ''

  const tailored = response.resume
  const resume: GeneratedResume = {
    ...base,
    summary: tailored.summary,
    skills: tailored.skills.filter((skill) => confirmed.some((fact) => containsPhrase(fact.valueText, skill))),
    experience: [],
    projects: [],
    education: [],
  }
  const bullets: BulletRecord[] = []
  const dropped: string[] = []

  for (const entry of tailored.entries) {
    const id = entry.source_entity_id
    const kept = entry.bullets.filter((bullet) => {
      const supported = bullet.source_fact_ids.length > 0 && bullet.source_fact_ids.every((factId) => known.has(factId))
      if (!supported) dropped.push(bullet.text)
      return supported
    })
    const texts = kept.map((bullet) => bullet.text)
    let section: BulletRecord['section']
    if (entry.section === 'project') {
      section = 'projects'
      resume.projects.push({
        name: entry.title,
        technologies: values(id, 'tools_used').join(', '),
        link: value(id, 'public_url'),
        bullets: texts,
      })
    } else if (entry.section === 'education') {
      section = 'education'
      resume.education.push({
        school: entry.organization ?? value(id, 'institution'),
        degree: value(id, 'degree') || entry.title,
        field: value(id, 'field'),
        year: entry.dates ?? '',
        details: texts.join('\n'),
      })
    } else {
      section = 'experience'
      resume.experience.push({
        company: entry.organization ?? '',
        position: entry.title,
        location: value(id, 'location'),
        duration: entry.dates ?? '',
        bullets: texts,
      })
    }
    bullets.push(...kept.map((bullet) => ({ section, text: bullet.text, factIds: bullet.source_fact_ids })))
  }

  const tailoring: TailoringPoint[] = [
    {
      id: 'wording',
      area: 'Wording',
      detail: `Claude (${response.model}) reworded and reordered your confirmed facts for this job. Every bullet cites the facts it is based on.`,
    },
    ...tailored.change_notes.map((note, i) => ({ id: `note_${i + 1}`, area: 'Tailoring', detail: note })),
  ]
  if (tailored.keyword_coverage.missing.length > 0) {
    tailoring.push({
      id: 'missing',
      area: 'Missing keywords',
      detail: `${tailored.keyword_coverage.missing.join(', ')}: not supported by confirmed facts, so left off.`,
    })
  }
  if (dropped.length > 0) {
    tailoring.push({
      id: 'dropped',
      area: 'Removed',
      detail: `${dropped.length} suggested bullet(s) didn’t cite confirmed facts and were removed.`,
    })
  }

  const estimate = pageEstimate(resume)
  const problems = estimate > pageLimit ? [`About ${estimate} pages; the template allows ${pageLimit}.`] : []
  return {
    resume,
    bullets,
    keywordBank: keywordBank(bullets, resume.skills),
    validation: { ok: problems.length === 0, problems, pageEstimate: estimate, retries: 0 },
    tailoring,
    factIds: [...new Set(bullets.flatMap((bullet) => bullet.factIds))],
  }
}

/** Tailor confirmed facts to a job with llm_app. `base` is the non-LLM draft, used for contact details. */
export async function tailorWithLlm(
  facts: BankFact[],
  job: ScrapedJob,
  base: GeneratedResume,
  pageLimit: number,
): Promise<GeneratedFromFacts> {
  const profile = profileFromFacts(confirmedFacts(facts))
  const instructions = `Keep the resume to about ${pageLimit} page${pageLimit === 1 ? '' : 's'}.`
  const response = await tailorResume(profile, job, instructions)
  return resumeFromTailoring(response, facts, base, pageLimit)
}
