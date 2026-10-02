import assert from 'node:assert/strict'
import test from 'node:test'

import type { ResumeExtraction } from '../src/parse_resume.ts'
import type { FactRecord } from '../src/resume_field_conventions.ts'
import { extractionToResumeImport } from '../src/frontend/lib/extractionToDataBank.ts'

function fact(key: string, value: unknown): FactRecord {
  return {
    id: key,
    key,
    value,
    assertion_status: 'extracted',
    evidence_ids: [],
    confirmation_evidence_id: null,
    confirmed_by: null,
    confirmed_at: null,
  }
}

test('parser profile fields fill the data bank instead of a sample person', () => {
  const extraction = {
    candidate_profile: {
      person: { facts: [fact('full_name', 'Ada Example'), fact('email', 'ada@example.com')] },
      experience: [{
        facts: [
          fact('organization', 'Example Lab'),
          fact('title', 'Researcher'),
          fact('start_date', '2026-01'),
          fact('completion_status', 'ongoing'),
          fact('personal_responsibilities', 'Built a parser.'),
        ],
      }],
      projects: [],
      education: [],
      skills: [{ facts: [fact('name', 'Python'), fact('category', 'programming_language')] }],
      awards: [],
      certifications: [],
      volunteering: [],
    },
    extraction_report: { warnings: ['Check the expected end date.'] },
  } as unknown as ResumeExtraction

  const imported = extractionToResumeImport(extraction)
  assert.equal(imported.data.profile?.[0]?.name, 'Ada Example')
  assert.equal(imported.data.experience?.[0]?.company, 'Example Lab')
  assert.equal(imported.data.experience?.[0]?.startDate, 'Jan 2026')
  assert.equal(imported.data.experience?.[0]?.endDate, 'Present')
  assert.equal(imported.data.skills?.[0]?.name, 'Python')
  assert.deepEqual(imported.warnings, ['Check the expected end date.'])
  assert.equal(JSON.stringify(imported).includes('Jordan Smith'), false)
})
