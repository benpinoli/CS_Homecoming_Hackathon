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

test('hyphenated phrases and repository names are not harvested as tools', () => {
  const header = 'Classifier | Python'
  const bullet = 'Mapped NAICS six-digit codes. Repository roof-snap. non-orthogonality, form-writing, and template-based notes.'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Classifier' }),
        fact({
          id: 'fact_tools',
          key: 'tools_used',
          value: ['Python', 'six-digit', 'roof-snap', 'non-orthogonality', 'form-writing', 'template-based'],
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
  const tools = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts.find(
    (item) => item.key === 'tools_used',
  )
  const names = (tools?.value as Array<{ name: string; kind: string }>).map((item) => item.name)
  assert.deepEqual(names, ['Python'])
  assert.equal(result.extraction_report.warnings.some((warning) => warning.includes('six-digit')), true)
})

test('explicit date ranges stay start and end, and Present is ongoing', () => {
  const job = 'Example Lab, Jan 2026–Apr 2026'
  const volunteer = 'Tutor, Sep 2024 – Present'
  const result = normalizeResumeExtraction(
    extraction([], {
      projects: [],
      experience: [
        {
          id: 'job_1',
          facts: [
            fact({ id: 'job_start', key: 'start_date', value: '2026-01' }),
            fact({ id: 'job_end', key: 'end_date', value: '2026-04' }),
          ],
        },
      ],
      volunteering: [
        {
          id: 'vol_1',
          facts: [
            fact({ id: 'vol_start', key: 'start_date', value: '2024-09', evidence_ids: ['evidence_2'] }),
            fact({ id: 'vol_end', key: 'end_date', value: 'Present', evidence_ids: ['evidence_2'] }),
          ],
        },
      ],
      evidence: [
        { id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote: job },
        { id: 'evidence_2', source_id: 'source_resume', locator: 'line 2', quote: volunteer },
      ],
    }),
    request([
      { locator: 'line 1', text: job },
      { locator: 'line 2', text: volunteer },
    ]),
  )
  const jobFacts = (result.candidate_profile as unknown as { experience: Array<{ facts: FactRecord[] }> }).experience[0].facts
  assert.equal(jobFacts.find((item) => item.id === 'job_start')?.key, 'start_date')
  assert.equal(jobFacts.find((item) => item.id === 'job_end')?.key, 'end_date')
  assert.equal(result.extraction_report.warnings.some((warning) => warning.includes('job_start')), false)

  const volunteerFacts = (result.candidate_profile as unknown as { volunteering: Array<{ facts: FactRecord[] }> }).volunteering[0].facts
  assert.equal(volunteerFacts.find((item) => item.id === 'vol_start')?.key, 'start_date')
  assert.equal(volunteerFacts.some((item) => item.key === 'end_date'), false)
  assert.equal(volunteerFacts.find((item) => item.key === 'completion_status')?.value, 'ongoing')
  assert.equal(volunteerFacts.find((item) => item.key === 'completion_status')?.assertion_status, 'extracted')
})

test('normalized AUC and ongoing status are not false evidence warnings', () => {
  const quote = 'Model reached .83 AUC. Role is Present.'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_auc', key: 'outcome_metric', value: { value: 0.83, unit: 'AUC', projected: false, method: null } }),
        fact({ id: 'fact_status', key: 'completion_status', value: 'ongoing' }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(facts.find((item) => item.id === 'fact_auc')?.assertion_status, 'extracted')
  assert.equal(facts.find((item) => item.id === 'fact_status')?.assertion_status, 'extracted')
  assert.equal(
    result.extraction_report.warnings.some((warning) => warning.includes('does not support')),
    false,
  )
})

test('unsupported relationships stay out of factual records and questions are not duplicated', () => {
  const quote = 'Forecast model with Bear Automation'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Forecast model' }),
        fact({ id: 'fact_rel', key: 'proposed_related_experience_id', value: 'job_1' }),
      ],
      {
        experience: [
          {
            id: 'job_1',
            facts: [fact({ id: 'fact_org', key: 'organization', value: 'Bear Automation', evidence_ids: [] })],
          },
        ],
        open_questions: [
          {
            id: 'question_existing',
            entity_id: 'project_1',
            field_key: 'related_experience_id',
            question: 'Is this project part of a specific job, or only associated with the organization?',
            reason: 'ambiguous',
            evidence_ids: ['evidence_1'],
            state: 'open',
          },
        ],
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(facts.some((item) => item.key.includes('related_experience')), false)
  const questions = (result.candidate_profile as unknown as { open_questions: Array<{ question: string }> }).open_questions
  const relationshipQuestions = questions.filter((item) => item.question.includes('specific job'))
  assert.equal(relationshipQuestions.length, 1)
})

test('separate tool facts collapse to one deduped array and percentages stay supported', () => {
  const quote = 'Roofing Area Estimator | Python. Built .83 AUC estimates with Gemini API. Projected savings upon rollout of 20%.'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Roofing Area Estimator' }),
        fact({ id: 'tools_a', key: 'tools_used', value: 'Python' }),
        fact({ id: 'tools_b', key: 'tools_used', value: { name: 'Gemini API', category: 'service' } }),
        fact({ id: 'tools_c', key: 'tools_used', value: ['Python'] }),
        fact({
          id: 'fact_metric',
          key: 'outcome_metric',
          value: { metric: 'projected savings upon rollout', value: '20%' },
        }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  const toolFacts = facts.filter((item) => item.key === 'tools_used')
  assert.equal(toolFacts.length, 1)
  assert.deepEqual(
    (toolFacts[0].value as Array<{ name: string; kind: string }>).map((item) => item.name).sort(),
    ['Gemini API', 'Python'],
  )
  assert.equal(facts.find((item) => item.id === 'fact_metric')?.assertion_status, 'extracted')
})

test('tight date ranges stay start and end, and volunteer text stays off later projects', () => {
  const rangeQuote = 'Quantitative Researcher, Jan 2026-Apr 2026'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'ChineseCheat' }),
        fact({ id: 'fact_tools', key: 'tools_used', value: ['Python', 'six-digit', 'on-field'] }),
      ],
      {
        experience: [
          {
            id: 'job_range',
            facts: [
              fact({ id: 'range_start', key: 'listed_date', value: '2026-01', evidence_ids: ['evidence_range'] }),
              fact({ id: 'range_end', key: 'listed_date', value: '2026-04', evidence_ids: ['evidence_range'] }),
            ],
          },
          {
            id: 'job_volunteer',
            facts: [
              fact({ id: 'vol_title', key: 'title', value: 'Volunteer Service Representative', evidence_ids: ['evidence_2'] }),
              fact({ id: 'vol_org', key: 'organization', value: 'Example Church', evidence_ids: ['evidence_2'] }),
            ],
          },
        ],
        volunteering: [
          {
            id: 'vol_1',
            facts: [
              fact({ id: 'vol_role', key: 'role', value: 'Volunteer Service Representative', evidence_ids: ['evidence_2'] }),
              fact({ id: 'vol_org_2', key: 'organization', value: 'Example Church', evidence_ids: ['evidence_2'] }),
            ],
          },
        ],
        evidence: [
          { id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote: 'ChineseCheat | Python' },
          { id: 'evidence_2', source_id: 'source_resume', locator: 'line 2', quote: 'Volunteer Service Representative, Jun 2023-Jun 2025' },
          { id: 'evidence_range', source_id: 'source_resume', locator: 'line 4', quote: rangeQuote },
        ],
      },
    ),
    request([
      { locator: 'line 1', text: 'ChineseCheat | Python' },
      { locator: 'line 2', text: 'Volunteer Service Representative, Jun 2023-Jun 2025' },
      { locator: 'line 3', text: 'Developed on-field technology methods and trained 70 leaders over ~5,000 volunteers' },
      { locator: 'line 4', text: rangeQuote },
    ]),
  )
  const job = (result.candidate_profile as unknown as { experience: Array<{ id: string; facts: FactRecord[] }> }).experience
  const range = job.find((item) => item.id === 'job_range')
  assert.equal(range?.facts.find((item) => item.id === 'range_start')?.key, 'start_date')
  assert.equal(range?.facts.find((item) => item.id === 'range_end')?.key, 'end_date')
  assert.equal(job.some((item) => item.id === 'job_volunteer'), false)

  const tools = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts.find(
    (item) => item.key === 'tools_used',
  )
  const names = (tools?.value as Array<{ name: string }>).map((item) => item.name)
  assert.deepEqual(names, ['Python'])
  assert.equal(names.includes('on-field'), false)
  assert.equal(names.includes('six-digit'), false)
})

test('an invented supervision metric is removed and a repeated percent is not duplicated', () => {
  const quote = 'Trained 70 leaders over ~5,000 volunteers. Achieved 85% accuracy.'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({
          id: 'fact_metric',
          key: 'outcome_metric',
          value: { metric: 'volunteers supervised', value: '~5,000' },
        }),
        fact({
          id: 'fact_accuracy',
          key: 'outcome_metric',
          value: { metric: 'accuracy', value: '85%' },
        }),
        fact({ id: 'fact_text', key: 'personal_responsibilities', value: quote }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const facts = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts
  assert.equal(
    facts.some((item) => JSON.stringify(item.value).includes('supervised')),
    false,
  )
  const accuracyMetrics = facts.filter(
    (item) => item.key === 'outcome_metric' && JSON.stringify(item.value).includes('85'),
  )
  assert.equal(accuracyMetrics.length, 1)
})

test('an unlabeled dollar amount stays unresolved instead of being called a budget', () => {
  const quote = 'by .5M USD over 7.5 months in southern Taiwan'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({
          id: 'fact_158',
          key: 'outcome_metric',
          value: { metric: 'budget supported', value: 0.5, unit: 'M USD' },
        }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const metric = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts.find(
    (item) => item.id === 'fact_158',
  )
  const value = metric?.value as { value: number; unit: string; metric?: string; meaning_status?: string }
  assert.equal(value.value, 0.5)
  assert.equal(value.unit, 'M USD')
  assert.equal(value.metric, undefined)
  assert.equal(value.meaning_status, 'unresolved')
  const questions = (result.candidate_profile as unknown as { open_questions: Array<{ entity_id: string; question: string }> }).open_questions
  assert.equal(questions.some((item) => item.entity_id === 'project_1' && /what does that figure represent/i.test(item.question)), true)
})

test('question entity ids must resolve to entities, and roof accuracy stays qualified', () => {
  const quote = 'Leveraged Gemini API to create a website for obtaining 80% accurate roof area estimates'
  const result = normalizeResumeExtraction(
    extraction(
      [
        fact({ id: 'fact_name', key: 'name', value: 'Roofing Area Estimator' }),
        fact({
          id: 'fact_98',
          key: 'outcome_metric',
          value: { metric: 'accuracy', value: 80, unit: 'percent' },
        }),
      ],
      {
        evidence: [{ id: 'evidence_1', source_id: 'source_resume', locator: 'line 1', quote }],
        open_questions: [
          {
            id: 'q_7',
            entity_id: 'fact_98',
            field_key: 'accuracy_definition',
            question: 'What is the definition or measurement method for the 80% accuracy metric?',
            reason: 'ambiguous',
            evidence_ids: ['evidence_1'],
            state: 'open',
          },
          {
            id: 'q_missing',
            entity_id: 'does_not_exist',
            field_key: 'name',
            question: 'Which project is this?',
            reason: 'ambiguous',
            evidence_ids: [],
            state: 'open',
          },
        ],
      },
    ),
    request([{ locator: 'line 1', text: quote }]),
  )
  const metric = (result.candidate_profile as unknown as { projects: Array<{ facts: FactRecord[] }> }).projects[0].facts.find(
    (item) => item.id === 'fact_98',
  )?.value as { value: number; accuracy_definition?: string; measurement_method?: string }
  assert.equal(metric.value, 80)
  assert.equal(metric.accuracy_definition, 'unspecified')
  assert.equal(metric.measurement_method, 'unspecified')
  const questions = (result.candidate_profile as unknown as { open_questions: Array<{ id: string; entity_id: string | null }> }).open_questions
  assert.equal(questions.find((item) => item.id === 'q_7')?.entity_id, 'project_1')
  assert.equal(questions.find((item) => item.id === 'q_missing')?.entity_id, null)
  assert.equal(
    result.extraction_report.warnings.some((warning) => warning.includes('q_missing')),
    true,
  )
})

test('skill categories are metadata, and curly quotes still count as the same evidence', () => {
  const block = 'Languages : Python, C++, SQL. 2X Dean\u2019s List. Other Projects: \u201cShane Street\u201d'
  const result = normalizeResumeExtraction(
    extraction([], {
      projects: [],
      skills: [
        {
          id: 'skill_1',
          facts: [
            fact({ id: 'fact_name', key: 'name', value: 'Python', evidence_ids: ['evidence_skill'] }),
            fact({ id: 'fact_114', key: 'category', value: 'programming_language', evidence_ids: ['evidence_skill'] }),
          ],
        },
      ],
      education: [
        {
          id: 'edu_1',
          facts: [fact({ id: 'fact_15', key: 'honors', value: "2X Dean's List", evidence_ids: ['evidence_honor'] })],
        },
      ],
      evidence: [
        { id: 'evidence_skill', source_id: 'source_resume', locator: 'line 1', quote: 'Languages : Python, C++, SQL' },
        { id: 'evidence_honor', source_id: 'source_resume', locator: 'line 1', quote: "2X Dean's List" },
        {
          id: 'evidence_project',
          source_id: 'source_resume',
          locator: 'line 1',
          quote: 'Other Projects: "Shane Street"',
        },
      ],
    }),
    request([{ locator: 'line 1', text: block }]),
  )
  const category = (result.candidate_profile as unknown as { skills: Array<{ facts: FactRecord[] }> }).skills[0].facts.find(
    (item) => item.id === 'fact_114',
  )
  assert.equal(category?.assertion_status, 'extracted')
  const honors = (result.candidate_profile as unknown as { education: Array<{ facts: FactRecord[] }> }).education[0].facts[0]
  assert.equal(honors.assertion_status, 'extracted')
  assert.equal(
    result.extraction_report.warnings.some((warning) => /fact_114|fact_15/.test(warning)),
    false,
  )
})
