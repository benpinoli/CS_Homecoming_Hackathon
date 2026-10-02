import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  ParseResumeApiRequest,
  ResumeExtraction,
} from '../src/parse_resume.ts'
import { factValuesByKey, mergeProposalIntoProfile, normalizeResumeExtraction } from '../src/resume_extraction_validate.ts'
import { blocksFromPdfTextItems, segmentResumeIntoBlocks } from '../src/resume_ingest.ts'
import type { FactRecord } from '../src/resume_field_conventions.ts'

function fact(partial: Partial<FactRecord> & Pick<FactRecord, 'id' | 'key' | 'value'>): FactRecord {
  return {
    assertion_status: 'extracted',
    evidence_ids: ['evidence_1'],
    confirmation_evidence_id: null,
    confirmed_by: null,
    confirmed_at: null,
    ...partial,
  }
}

function extraction(
  facts: FactRecord[],
  extras?: Partial<ResumeExtraction['candidate_profile']>,
  warnings: string[] = [],
): ResumeExtraction {
  return {
    candidate_profile: {
      schema_version: '1.0',
      profile_id: 'profile_test',
      revision: 0,
      is_fictional_example: false,
      updated_at: '2026-03-01T00:00:00.000Z',
      sources: [],
      evidence: [
        {
          id: 'evidence_1',
          source_id: 'source_resume',
          locator: 'line 1',
          quote: 'placeholder',
        },
      ],
      person: { id: 'person_1', facts: [] },
      education: [],
      experience: [],
      projects: [{ id: 'project_1', facts }],
      skills: [],
      awards: [],
      certifications: [],
      publications: [],
      volunteering: [],
      languages: [],
      preferences: [],
      other_experiences: [],
      inventory_coverage: [],
      open_questions: [],
      conflicts: [],
      ...extras,
    },
    extraction_report: {
      input_source_ids: ['source_resume'],
      processed_input_blocks: [],
      unprocessed_input_blocks: [],
      unmapped_passages: [],
      warnings,
      needs_user_review: true,
    },
  }
}

function request(blocks: Array<{ locator: string; text: string }>): ParseResumeApiRequest {
  return {
    profile_id: 'profile_test',
    person_entity_id: 'person_1',
    captured_at: '2026-03-01T00:00:00.000Z',
    sources: [
      {
        source_id: 'source_resume',
        source_type: 'resume',
        source_label: 'resume.txt',
        blocks,
      },
    ],
  }
}

test('plain text keeps line ranges instead of one line_1 block', () => {
  const blocks = segmentResumeIntoBlocks(
    'Competitive Market Subsets DLM | Python Mar 2026\n\n- Estimated roof area\n',
  )
  assert.deepEqual(
    blocks.map((block) => block.locator),
    ['line 1', 'line 3'],
  )
})

test('pdf items keep page paragraph and bullet locators and blank pages', () => {
  const ingested = blocksFromPdfTextItems([
    [
      { str: 'PatientOS | TypeScript', x: 10, y: 700 },
      { str: '• Used AWS Amplify and Supabase', x: 10, y: 680 },
    ],
    [],
  ])
  assert.deepEqual(
    ingested.blocks.map((block) => block.locator),
    ['page 1, paragraph 1', 'page 1, bullet 1'],
  )
  assert.deepEqual(ingested.unreadableLocators, ['page 2'])
})

test('standalone header date becomes listed_date', () => {
  const quote = 'Competitive Market Subsets DLM | Python Mar 2026'
  const result = normalizeResumeExtraction(
    extraction([
      fact({ id: 'fact_name', key: 'name', value: 'Competitive Market Subsets DLM' }),
      fact({ id: 'fact_end', key: 'end_date', value: '2026-03' }),
    ]),
    request([{ locator: 'line 1', text: quote }]),
  )
  const profile = result.candidate_profile as unknown as {
    projects: Array<{ facts: FactRecord[] }>
    evidence: Array<{ quote: string }>
  }
  profile.evidence[0].quote = quote
  const again = normalizeResumeExtraction(
    {
      ...result,
      candidate_profile: {
        ...result.candidate_profile,
        projects: [
          {
            id: 'project_1',
            facts: [
              fact({ id: 'fact_name', key: 'name', value: 'Competitive Market Subsets DLM' }),
              fact({ id: 'fact_end', key: 'end_date', value: '2026-03' }),
            ],
          },
        ],
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    },
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (again.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(facts.find((item) => item.id === 'fact_end')?.key, 'listed_date')
  assert.equal(facts.some((item) => item.key === 'end_date'), false)
})

test('ongoing role omits end_date', () => {
  const quote = 'Research assistant, Example Lab, Jan 2026 – Present'
  const result = normalizeResumeExtraction(
    extraction(
      [fact({ id: 'fact_end', key: 'end_date', value: 'present' })],
      {
        experience: [
          {
            id: 'job_1',
            facts: [fact({ id: 'fact_end', key: 'end_date', value: 'present' })],
          },
        ],
        projects: [],
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { experience: Array<{ facts: FactRecord[] }> }).experience[0].facts
  assert.equal(facts.some((item) => item.key === 'end_date'), false)
  assert.equal(facts.find((item) => item.key === 'completion_status')?.value, 'ongoing')
})

test('shared tools do not assert related_experience_id', () => {
  const quote = 'Forecast model with Bear Automation using Python'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Forecast model' }),
        fact({ id: 'fact_rel', key: 'related_experience_id', value: 'job_1' }),
      ],
      {
        experience: [
          {
            id: 'job_1',
            facts: [fact({ id: 'fact_org', key: 'organization', value: 'Bear Automation', evidence_ids: [] })],
          },
        ],
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(facts.some((item) => item.key === 'related_experience_id'), false)
  assert.equal(facts.find((item) => item.key === 'associated_organization')?.value, 'Bear Automation')
  assert.match(result.extraction_report.warnings.join('\n'), /not explicitly connect/)
})

test('header and bullet tools both survive with evidence', () => {
  const header = 'Roofing Area Estimator | Python'
  const bullet = 'Used Gemini API and Google Solar API'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Roofing Area Estimator' }),
        fact({
          id: 'fact_tools',
          key: 'tools_used',
          value: ['Python', 'Gemini API', 'Google Solar API'],
        }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote: header }],
      },
    ),
    request([
      { locator: 'line 1', text: header },
      { locator: 'line 2', text: bullet },
    ]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  const tools = facts.find((item) => item.key === 'tools_used')
  const names = (tools?.value as Array<{ name: string }>).map((item) => item.name).sort()
  assert.deepEqual(names, ['Gemini API', 'Google Solar API', 'Python'])
  assert.ok((tools?.evidence_ids.length ?? 0) >= 2)
})

test('project bullets keep tools that the header omitted', () => {
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'PatientOS' }),
        fact({ id: 'fact_tools', key: 'tools_used', value: ['TypeScript', 'PLpgSQL'] }),
      ],
      {
        evidence: [
          {
            id: 'evidence_1',
            source_id: 'source_resume',
            locator: 'page 1, paragraph 1',
            quote: 'PatientOS | TypeScript, PLpgSQL',
          },
        ],
      },
    ),
    request([
      { locator: 'page 1, paragraph 1', text: 'PatientOS | TypeScript, PLpgSQL' },
      { locator: 'page 1, bullet 1', text: 'Deployed with AWS Amplify, EC2, Supabase, and Gemini API' },
      { locator: 'page 1, bullet 2', text: 'Backtested in sf-quant' },
    ]),
  )
  const tools = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts.find(
    (item) => item.key === 'tools_used',
  )
  const names = (tools?.value as Array<{ name: string; kind: string }>).map((item) => item.name)
  assert.ok(names.includes('AWS Amplify'))
  assert.ok(names.includes('EC2'))
  assert.ok(names.includes('Supabase'))
  assert.ok(names.includes('Gemini API'))
  assert.ok(names.includes('sf-quant'))
})

test('linkedin is a platform, coursework stays listed, null facts are omitted', () => {
  const quote = 'LinkedIn. Courses: Databases. Placed third.'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_disc', key: 'public_disclosure', value: 'LinkedIn' }),
        fact({ id: 'fact_course', key: 'completed_coursework', value: 'Databases' }),
        fact({ id: 'fact_null', key: 'formal_proficiency_test_status', value: null }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(facts.find((item) => item.id === 'fact_disc')?.key, 'source_platform')
  assert.equal(facts.find((item) => item.id === 'fact_course')?.key, 'listed_coursework')
  assert.equal(facts.some((item) => item.key === 'formal_proficiency_test_status'), false)
})

test('placement does not invent an award name', () => {
  const quote = 'Placed third in the campus challenge'
  const result = normalizeResumeExtraction(
    extraction(
      [fact({ id: 'fact_name', key: 'name', value: 'National Forecasting Cup' })],
      {
        awards: [{ id: 'award_1', facts: [fact({ id: 'fact_name', key: 'name', value: 'National Forecasting Cup' })] }],
        projects: [],
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const award = (result.candidate_profile as unknown as { awards: Array<{ facts: FactRecord[] }> }).awards[0]
  assert.equal(award.facts[0].value, 'Placed third')
  assert.match(
    (result.candidate_profile as unknown as { open_questions: Array<{ question: string }> }).open_questions
      .map((item) => item.question)
      .join('\n'),
    /event/i,
  )
})

test('metrics stay qualified and separate from responsibility text', () => {
  const quote = 'Potential time savings of 80% accurate roof area estimates; AUC of 0.83; annual out-of-sample alpha of 10.7%; integration of 10+ sources'
  const result = normalizeResumeExtraction(
    extraction(
      [fact({ id: 'fact_resp', key: 'personal_contributions', value: quote })],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  const metrics = facts.filter((item) => item.key === 'outcome_metric').map((item) => item.value as { value: number; projected?: boolean; accuracy_definition?: string; realized_return?: boolean; approximation?: string })
  assert.equal(facts.filter((item) => item.key === 'personal_contributions').length, 1)
  assert.ok(metrics.some((item) => item.value === 0.83))
  assert.ok(metrics.some((item) => item.value === 80 && item.accuracy_definition === 'unspecified' && item.projected === true))
  assert.ok(metrics.some((item) => item.value === 10.7 && item.realized_return === false))
  assert.ok(metrics.some((item) => item.value === 10 && item.approximation === 'lower_bound'))
})

test('repeated fact keys are all retained and single-value clashes are conflicts', () => {
  const quote = 'Built the pipeline. Wrote the tests. Title A. Title B.'
  const facts = [
    fact({ id: 'c1', key: 'personal_contributions', value: 'Built the pipeline' }),
    fact({ id: 'c2', key: 'personal_contributions', value: 'Wrote the tests' }),
    fact({ id: 't1', key: 'title', value: 'Analyst' }),
    fact({ id: 't2', key: 'title', value: 'Intern', evidence_ids: ['evidence_1'] }),
  ]
  const result = normalizeResumeExtraction(
    extraction(facts, {
      evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
    }),
    request([{ locator: 'line 1', text: quote }]),
  )
  const project = (result.candidate_profile as unknown as { projects: Array<{ id: string; facts: FactRecord[] }>; conflicts: Array<{ field_key: string; fact_ids: string[] }> }).projects[0]
  const grouped = factValuesByKey(project.facts)
  assert.deepEqual(grouped.get('personal_contributions'), ['Built the pipeline', 'Wrote the tests'])
  assert.equal(
    result.candidate_profile.conflicts.some((item) => (item as { field_key: string }).field_key === 'title'),
    true,
  )
})

test('parser cannot confirm facts and later imports keep confirmed history', () => {
  const quote = 'Alex Rivera'
  const proposal = normalizeResumeExtraction(
    extraction(
      [
        fact({
          id: 'fact_name',
          key: 'full_name',
          value: 'Alex Rivera',
          assertion_status: 'confirmed',
          confirmed_by: 'model',
          confirmed_at: '2026-03-01T00:00:00.000Z',
          confirmation_evidence_id: 'evidence_1',
        }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const proposedFact = (proposal.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts[0]
  assert.equal(proposedFact.assertion_status, 'extracted')
  assert.equal(proposedFact.confirmed_by, null)

  const merged = mergeProposalIntoProfile(
    {
      ...proposal.candidate_profile,
      projects: [
        {
          id: 'project_1',
          facts: [
            {
              ...proposedFact,
              id: 'fact_kept',
              assertion_status: 'confirmed',
              confirmed_by: 'user',
              confirmed_at: '2026-03-02T00:00:00.000Z',
              confirmation_evidence_id: 'evidence_user',
            },
          ],
        },
      ],
    },
    {
      ...proposal.candidate_profile,
      projects: [
        {
          id: 'project_1',
          facts: [
            {
              ...proposedFact,
              id: 'fact_kept',
              value: 'Someone Else',
              assertion_status: 'confirmed',
              confirmed_by: 'model',
            },
          ],
        },
      ],
    },
  )
  const kept = (merged as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts[0]
  assert.equal(kept.value, 'Alex Rivera')
  assert.equal(kept.assertion_status, 'confirmed')
  assert.equal(kept.confirmed_by, 'user')
})
