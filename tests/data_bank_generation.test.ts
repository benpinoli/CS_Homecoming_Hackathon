import assert from 'node:assert/strict'
import test from 'node:test'

import { SECTIONS, blankEntry, dataBankToFacts, initialData, loadDataBank, saveDataBank } from '../src/frontend/lib/dataBank.ts'
import type { DataBank } from '../src/frontend/lib/dataBank.ts'
import { generateFromConfirmedFacts } from '../src/frontend/lib/generateFromFacts.ts'
import { requirementsFromJobText } from '../src/frontend/lib/requirementMatch.ts'

const def = (id: string) => SECTIONS.find((s) => s.id === id)!
const entry = (id: string, values: Record<string, string>) => ({ ...blankEntry(def(id)), ...values })

/** A Data Bank filled in by hand: nothing here ever went through the parser or a confirm step */
function typedByHand(): DataBank {
  const data = initialData()
  data.profile = [entry('profile', { id: 'profile', name: 'Sam Lee', email: 'sam@example.com', location: 'Denver, CO', summary: 'Operations lead.' })]
  data.experience = [
    entry('experience', {
      company: 'Summit Logistics', position: 'Operations Manager', startDate: 'Jun 2021', endDate: 'Present',
      description: '• Led a team of 12 across scheduling and inventory\n- Cut delivery delays by 25%\n\nOwned a $1.2M purchasing budget',
    }),
  ]
  data.projects = [entry('projects', { name: 'Warehouse Consolidation', technologies: 'Budgeting, vendor negotiation', description: 'Merged two facilities, saving $180K per year' })]
  data.education = [entry('education', { school: 'City College', degree: 'B.A.', field: 'Business', endDate: 'May 2018', gpa: '3.8', details: 'Magna Cum Laude' })]
  data.skills = [entry('skills', { name: 'Excel', category: 'Software' }), entry('skills', { name: 'Python' })]
  data.volunteer = [entry('volunteer', { organization: 'Food Bank', role: 'Coordinator', description: 'Scheduled 30 weekly volunteers' })]
  return data
}

test('everything typed into the Data Bank is usable with no confirmation step', () => {
  const facts = dataBankToFacts(typedByHand())
  assert.ok(facts.length > 0)
  assert.ok(facts.every((f) => f.assertion_status === 'confirmed'), 'all Data Bank facts are trusted')
  assert.equal(new Set(facts.map((f) => f.id)).size, facts.length, 'fact ids are unique')
})

test('a resume is generated straight from hand-entered data', () => {
  const generated = generateFromConfirmedFacts(dataBankToFacts(typedByHand()), requirementsFromJobText('Operations leadership, budgeting'), 1)
  const { resume } = generated
  assert.equal(resume.name, 'Sam Lee')
  assert.equal(resume.summary, 'Operations lead.')
  assert.equal(generated.validation.problems.filter((p) => /empty|confirm/i.test(p)).length, 0)

  const job = resume.experience.find((e) => e.company === 'Summit Logistics')!
  assert.equal(job.position, 'Operations Manager')
  assert.equal(job.duration, 'Jun 2021 – Present')
  assert.deepEqual([...job.bullets].sort(), [
    'Cut delivery delays by 25%', // bullet glyphs and dashes stripped, blank lines skipped
    'Led a team of 12 across scheduling and inventory',
    'Owned a $1.2M purchasing budget',
  ])
  assert.ok(resume.experience.some((e) => e.company === 'Food Bank'), 'volunteer roles are listed with experience')
  assert.equal(resume.projects[0].name, 'Warehouse Consolidation')
  assert.equal(resume.projects[0].technologies, 'Budgeting, vendor negotiation')
  assert.deepEqual(resume.skills.sort(), ['Excel', 'Python'])
  assert.match(resume.education[0].details, /GPA 3\.8/)
  assert.match(resume.education[0].details, /Magna Cum Laude/)
})

test('an empty Data Bank has nothing to build from', () => {
  assert.deepEqual(dataBankToFacts(initialData()), [])
  assert.ok(generateFromConfirmedFacts([], [], 1).validation.problems.some((p) => /empty/i.test(p)))
})

test('the Data Bank is saved and restored, and old or damaged saves are repaired', () => {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  }
  const original = typedByHand()
  saveDataBank(original)
  const restored = loadDataBank()
  assert.equal(restored.experience[0].company, 'Summit Logistics')
  assert.equal(restored.experience[0].id, original.experience[0].id)

  // a save from before a field existed still loads, with the new field empty
  const old = JSON.parse(store.get('resume-inator.data-bank')!)
  delete old.experience[0].location
  old.profile = [] // the Contact section must always keep exactly one entry
  store.set('resume-inator.data-bank', JSON.stringify(old))
  const repaired = loadDataBank()
  assert.equal(repaired.experience[0].location, '')
  assert.equal(repaired.profile.length, 1)

  store.set('resume-inator.data-bank', '{not json')
  assert.equal(loadDataBank().experience.length, 0)
})
