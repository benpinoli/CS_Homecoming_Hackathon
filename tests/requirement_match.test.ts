import assert from 'node:assert/strict'
import test from 'node:test'

import { gapsFillableFromConfirmed, matchRequirement, requirementsFromAnalysis, requirementsFromJobText, splitMatches } from '../src/frontend/lib/requirementMatch.ts'
import type { KeywordLink } from '../src/frontend/lib/requirementMatch.ts'
import { proposeBlockRole } from '../src/frontend/lib/docxTemplate.ts'
import { generateFromConfirmedFacts } from '../src/frontend/lib/generateFromFacts.ts'
import type { BankFact } from '../src/frontend/lib/experienceBank.ts'

const bank: KeywordLink[] = [
  { keyword: 'Java', bulletText: 'Built services in Java for two years.', factIds: ['fact_java'] },
  { keyword: 'Python', bulletText: 'Used Python for a class project.', factIds: ['fact_py'] },
]

test('analyzed keywords keep alternatives and years, and drop generic traits', () => {
  const requirements = requirementsFromAnalysis([
    { label: 'Python or Java', importance: 'required', alternatives: ['Python', 'Java'], min_years: null },
    { label: 'Five years of Python', importance: 'required', alternatives: ['Python'], min_years: 5 },
    { label: 'Team player', importance: 'preferred', alternatives: ['team player'], min_years: null },
  ])
  assert.equal(requirements.length, 2)
  assert.deepEqual(requirements[0].alternatives, ['Python', 'Java'])
  assert.equal(requirements[1].minYears, 5)
})

test('an or-requirement matches either keyword, and years are not implied by the word alone', () => {
  const [either, years] = requirementsFromJobText('Python or Java\nFive years of Python\nPreferred qualifications\nPublic speaking')
  assert.deepEqual(either.alternatives, ['Python', 'Java'])
  assert.equal(either.importance, 'required')
  assert.equal(matchRequirement(either, bank).matched, true)

  assert.equal(years.minYears, 5)
  assert.equal(years.alternatives[0], 'Python')
  assert.equal(matchRequirement(years, bank).matched, false)

  const split = splitMatches([either, years, requirementsFromJobText('Preferred qualifications\nPublic speaking')[0]], bank)
  assert.equal(split.requiredMissing.length, 1)
  assert.equal(split.preferredMissing[0]?.requirement.label, 'Public speaking')
})

test('a missing requirement is fillable only when a confirmed fact states it', () => {
  const [years] = requirementsFromJobText('Five years of Python')
  const missing = [matchRequirement(years, bank)]
  assert.equal(gapsFillableFromConfirmed(missing, [{ factId: 'fact_py', text: 'Used Python for a class project.' }]).length, 0)
  assert.equal(
    gapsFillableFromConfirmed(missing, [{ factId: 'fact_real', text: 'Five years of Python in production.' }]).length,
    1,
  )
})

test('generation keeps confirmed wording and drops unconfirmed claims', () => {
  const facts: BankFact[] = [
    { id: 'name', entityId: 'person', section: 'person', key: 'full_name', valueText: 'Ada Example', assertion_status: 'confirmed' },
    { id: 'job', entityId: 'exp_1', section: 'experience', key: 'organization', valueText: 'Example Lab', assertion_status: 'confirmed' },
    { id: 'title', entityId: 'exp_1', section: 'experience', key: 'title', valueText: 'Researcher', assertion_status: 'confirmed' },
    { id: 'bullet', entityId: 'exp_1', section: 'experience', key: 'personal_responsibilities', valueText: 'Used Python for a class project.', assertion_status: 'confirmed' },
    { id: 'secret', entityId: 'exp_1', section: 'experience', key: 'personal_responsibilities', valueText: 'Managed a secret budget.', assertion_status: 'extracted' },
  ]
  const generated = generateFromConfirmedFacts(facts, requirementsFromJobText('Python'), 1)
  const text = JSON.stringify(generated.resume)
  assert.equal(text.includes('class project'), true)
  assert.equal(text.includes('secret budget'), false)
  assert.equal(generated.keywordBank.some((item) => item.keyword === 'Python' && item.factIds.includes('bullet')), true)
  assert.equal(proposeBlockRole('Experience'), 'heading')
  assert.equal(proposeBlockRole('Led a team of 12.'), 'example')
})
