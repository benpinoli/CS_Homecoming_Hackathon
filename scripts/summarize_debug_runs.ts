import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

type Fact = { key: string; value: unknown; assertion_status?: string }
type Entity = { id: string; facts?: Fact[] }
type Profile = Record<string, Entity[] | Entity | unknown>

const collections = [
  'experience',
  'projects',
  'volunteering',
  'other_experiences',
  'skills',
]

function interesting(profile: Profile) {
  const rows: unknown[] = []
  for (const collection of collections) {
    const entities = profile[collection]
    if (!Array.isArray(entities)) {
      continue
    }
    for (const entity of entities) {
      const facts = (entity.facts ?? []).filter((fact) =>
        /date|tool|related|name|metric|status/.test(fact.key),
      )
      if (facts.length === 0 && collection !== 'other_experiences') {
        continue
      }
      rows.push({
        collection,
        id: entity.id,
        facts: facts.map((fact) => ({
          key: fact.key,
          status: fact.assertion_status,
          value: fact.value,
        })),
      })
    }
  }
  return rows
}

const root = join(process.cwd(), 'debug', 'resume-parser')
for (const dir of readdirSync(root).filter((name) => name.startsWith('2026')).sort()) {
  const base = join(root, dir)
  const prompts = JSON.parse(readFileSync(join(base, 'prompts.json'), 'utf8')) as { model: string }
  const stop = JSON.parse(readFileSync(join(base, 'stop-reason.json'), 'utf8')) as { stop_reason: string }
  const parsed = JSON.parse(readFileSync(join(base, 'parsed.json'), 'utf8')) as { candidate_profile: Profile }
  const finalJson = JSON.parse(readFileSync(join(base, 'final.json'), 'utf8')) as { candidate_profile: Profile }
  console.log(
    JSON.stringify({
      model: prompts.model,
      stop_reason: stop.stop_reason,
      parsed: interesting(parsed.candidate_profile),
      final: interesting(finalJson.candidate_profile),
    }),
  )
}
