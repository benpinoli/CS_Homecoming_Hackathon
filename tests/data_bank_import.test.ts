import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { findDuplicates, normalize, similar } from '../src/frontend/lib/duplicates.ts'
import { extractionToResumeImport, formatDate } from '../src/frontend/lib/extractionToDataBank.ts'

const example = JSON.parse(
  readFileSync(new URL('../src/backend/resume_json_builder/resume_bank_kit/example_profile.json', import.meta.url), 'utf8'),
)
const imported = extractionToResumeImport({ candidate_profile: example, extraction_report: { warnings: ['from parser'] } })

test('contact details come from the person entity', () => {
  const p = imported.data.profile?.[0]
  assert.equal(p?.name, 'Alex Rivera')
  assert.equal(p?.email, 'alex.rivera@example.com')
  assert.equal(p?.location, 'Denver, Colorado') // "United States" is left off
  assert.equal(p?.website, 'https://example.com/alex-rivera')
})

test('experience maps organization, title, dates and responsibilities', () => {
  const [first] = imported.data.experience ?? []
  assert.equal(first.company, 'Example Logistics')
  assert.equal(first.position, 'Software Engineering Intern')
  assert.equal(first.startDate, 'Jun 2026')
  assert.equal(first.endDate, 'Aug 2026')
  assert.match(first.description, /shipment-report automation/)
  assert.ok(first.description.includes('\n'), 'bullets are one per line')
})

test('education uses expected end date and folds GPA and coursework in', () => {
  const [edu] = imported.data.education ?? []
  assert.equal(edu.school, 'Example University')
  assert.equal(edu.endDate, 'Expected May 2027')
  assert.equal(edu.gpa, '3.78')
  assert.match(edu.details, /Coursework: Linear Algebra/)
  assert.match(edu.details, /In progress: Numerical Analysis/)
})

test('planned projects are skipped instead of listed as work done', () => {
  const names = (imported.data.projects ?? []).map((p) => p.name)
  assert.ok(!names.includes('Accessible Study Planner'), 'a planned project is not imported')
  assert.ok(names.includes('Sensor Stream Monitor'), 'an in-progress project is imported')
  assert.equal(imported.data.projects?.find((p) => p.name === 'Sensor Stream Monitor')?.endDate, 'Present')
  assert.ok(imported.warnings.some((w) => w.includes('Skipped “Accessible Study Planner”')))
})

test('skills, languages, certifications and awards land in their sections', () => {
  assert.ok(imported.data.skills?.some((s) => s.name === 'Python'))
  assert.ok(imported.data.skills?.some((s) => /Spanish \(conversational\)/.test(s.name) && s.category === 'Languages'))
  const certs = imported.data.certifications ?? []
  assert.ok(certs.some((c) => c.name === 'Python Foundations Certificate' && c.date === 'Dec 2025'))
  assert.ok(certs.some((c) => c.name.includes('Scholarship')))
  assert.equal(imported.data.volunteer?.[0].organization, 'Example Community Center')
})

test('parser warnings pass through and unmapped sections are mentioned', () => {
  assert.ok(imported.warnings.includes('from parser'))
  assert.ok(imported.warnings.some((w) => /1 publication wasn’t imported/.test(w)))
})

test('withdrawn facts are ignored and empty sections dropped', () => {
  const result = extractionToResumeImport({
    candidate_profile: {
      person: { id: 'p', facts: [{ key: 'full_name', value: 'A B', assertion_status: 'extracted' }, { key: 'email', value: 'x@y.com', assertion_status: 'withdrawn' }] },
      experience: [],
    },
  })
  assert.equal(result.data.profile?.[0].email, '')
  assert.equal(result.data.experience, undefined)
})

test('dates are formatted', () => {
  assert.equal(formatDate('2026-06'), 'Jun 2026')
  assert.equal(formatDate('2026-05-12'), 'May 12, 2026')
  assert.equal(formatDate('2024'), '2024')
})

test('similar() catches the usual variations', () => {
  assert.equal(normalize('Summit Logistics, Inc.'), 'summit logistics')
  assert.ok(similar('Summit Logistics, Inc.', 'summit logistics'))
  assert.ok(similar('Operations Manager', 'Operations Manager (Denver)'))
  assert.ok(similar('University of Colorado', 'Colorado University'))
  assert.ok(!similar('Summit Logistics', 'Front Range Supply'))
  assert.ok(!similar('', 'Summit'))
})

test('later entries that repeat earlier ones are flagged, with the matching fields', () => {
  const entries = [
    { id: 'a', company: 'Summit Logistics', position: 'Operations Manager', startDate: 'Jun 2021' },
    { id: 'b', company: 'Other Co', position: 'Analyst', startDate: '2019' },
    { id: 'c', company: 'Summit Logistics Inc.', position: 'Operations Manager', startDate: 'Jun 2021' },
  ] as never[]
  const flagged = findDuplicates('experience', entries)
  assert.deepEqual([...flagged.keys()], ['c'])
  assert.deepEqual(flagged.get('c'), { of: 'a', fields: ['company', 'position'] })
  assert.equal(findDuplicates('skills', [{ id: '1', name: 'Excel' }, { id: '2', name: 'excel' }] as never[]).size, 1)
  assert.equal(findDuplicates('skills', [{ id: '1', name: 'Excel' }, { id: '2', name: 'Python' }] as never[]).size, 0)
})

// ---- Regressions found with real parser output (fictional data, same shape) ----

type F = [string, unknown, string[]?]
const entity = (id: string, facts: F[]) => ({
  id,
  facts: facts.map(([key, value, evidence_ids], i) => ({
    id: `${id}_f${i}`,
    key,
    value,
    assertion_status: 'extracted',
    evidence_ids: evidence_ids ?? [],
    confirmation_evidence_id: null,
    confirmed_by: null,
    confirmed_at: null,
  })),
})
const evidence = (id: string, quote: string) => ({ id, source_id: 's1', locator: 'page 1, paragraph 1', quote })

const real = {
  candidate_profile: {
    person: entity('p', [['full_name', 'Sam Lee']]),
    evidence: [
      evidence('e1', 'Improved reading scores by running weekly workshops for 35+ students'),
      evidence('e2', 'Prov ided one‑on‑one support, raising grades by 50%'),
      evidence('e3', 'Marked homework fee dback quickly, grading 100+ papers weekly'),
      evidence('e4', 'Tutoring Hub Developed a scheduling tool that matches tutors to students. Cut booking time by 60% in an 18- hour build.'),
    ],
    experience: [
      entity('x1', [
        ['title', 'Tutor'],
        ['organization', 'City College'],
        ['start_date', '2025-09'],
        ['completion_status', 'ongoing'],
        // the model paraphrases, drops the numbers, and lists them as separate metrics
        ['personal_responsibilities', 'Ran weekly workshops', ['e1']],
        ['personal_responsibilities', 'Provided one-on-one support', ['e2']],
        ['personal_responsibilities', 'Marked homework feedback quickly', ['e3']],
        ['outcome_metric', { metric: 'reading score improvement', value: '50%' }, ['e2']],
        ['outcome_metric', { metric: 'students per workshop', value: '35+' }, ['e1']],
        ['outcome_metric', { metric: 'papers graded weekly', value: '100+' }, ['e3']],
      ]),
      // no evidence available at all: metrics must still not appear as bare numbers
      entity('x2', [
        ['title', 'Cashier'],
        ['organization', 'Corner Shop'],
        ['personal_responsibilities', 'Served customers'],
        ['outcome_metric', { metric: 'customers served daily', value: '80+' }],
      ]),
    ],
    projects: [
      entity('pr', [
        ['name', 'Tutoring Hub'],
        ['personal_contributions', 'Built a scheduling tool', ['e4']],
        ['tools_used', { name: 'Python', kind: 'programming_language' }],
      ]),
    ],
    education: [
      entity('ed', [
        ['institution', 'City College'],
        ['degree', 'Computer Science'], // a major, not a degree
        ['listed_date', '2024-05'], // a graduation date shown on the resume
      ]),
    ],
    skills: [entity('sk', [['name', 'HTML'], ['category', 'unspecified']])],
    awards: [entity('aw', [['name', 'Dean’s Award'], ['listed_date', '2023-12']])],
    certifications: [],
    volunteering: [],
  },
  extraction_report: {
    warnings: [
      'Check the expected end date.',
      'OCR quality issue: Name contains spaces (S A M  L E E) which have been normalized to Sam Lee.',
      'Evidence for fact_007 is missing or is not verbatim at its locator.',
      'Added source-named tool Python on proj_001.',
      'Resume-only extraction: No portfolio, repository, or other external sources were provided.',
      'Ambiguous date context: The resume does not provide explicit dates for the Tutoring Hub project.',
    ],
  },
}
const out = extractionToResumeImport(real as never)

test('bullets use the resume’s own sentences, with the numbers, instead of paraphrase plus stray metrics', () => {
  const lines = out.data.experience![0].description.split('\n')
  assert.deepEqual(lines, [
    'Improved reading scores by running weekly workshops for 35+ students',
    'Provided one-on-one support, raising grades by 50%', // spacing and the fancy hyphen repaired
    'Marked homework feedback quickly, grading 100+ papers weekly', // "fee dback" repaired from the model's own spelling
  ])
  assert.ok(!lines.some((l) => /^[\d.+%]+$/.test(l)), 'no bare "50%" style lines')
})

test('a metric with no source sentence is labeled, never a bare number', () => {
  assert.equal(out.data.experience![1].description, 'Served customers\ncustomers served daily: 80+')
})

test('a project quote becomes one bullet per sentence, without repeating the title', () => {
  const p = out.data.projects![0]
  assert.deepEqual(p.description.split('\n'), [
    'Developed a scheduling tool that matches tutors to students.',
    'Cut booking time by 60% in an 18-hour build.',
  ])
  assert.equal(p.technologies, 'Python')
})

test('a lone listed date fills graduation and award dates; a major is not called a degree', () => {
  const edu = out.data.education![0]
  assert.equal(edu.endDate, 'May 2024')
  assert.equal(edu.degree, '')
  assert.equal(edu.field, 'Computer Science')
  assert.equal(out.data.certifications![0].date, 'Dec 2023')
})

test('"unspecified" is not shown as a skill category', () => {
  assert.equal(out.data.skills![0].category, '')
})

test('parser diagnostics are hidden, plain notes are kept', () => {
  assert.deepEqual(out.warnings, ['Check the expected end date.'])
})

test('languages that differ only by symbols are not duplicates', () => {
  const skills = (names: string[]) => names.map((name, i) => ({ id: String(i), name })) as never[]
  assert.equal(findDuplicates('skills', skills(['C', 'C++', 'C#'])).size, 0)
  assert.equal(findDuplicates('skills', skills(['C++', 'c++'])).size, 1)
})
