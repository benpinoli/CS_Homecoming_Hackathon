/**
 * Compare configured Haiku and Sonnet parsers on one fixed resume.
 * Usage: node --experimental-strip-types scripts/compare_resume_models.ts --live
 * Without --live, this only prints the model ids and does not call Anthropic.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { loadResumeParserEnv, runResumeParserOnServer, CONFIGURED_PARSER_MODELS } from '../src/parse_resume_server.ts'
import type { ParseResumeApiRequest } from '../src/parse_resume.ts'

const FIXTURE = [
  'Alex Rivera',
  'Research Assistant, Example Lab, Jan 2026–Apr 2026',
  'Tutor, Example Center, Sep 2024 – Present',
  'Roofing Area Estimator | Python Mar 2026',
  'Built .83 AUC estimates with Gemini API. Repository roof-snap.',
  'Mapped NAICS six-digit codes using template-based form-writing notes.',
  'Forecast Desk',
  'Projected savings upon rollout of 20%.',
].join('\n')

function request(): ParseResumeApiRequest {
  const lines = FIXTURE.split('\n')
  return {
    profile_id: 'profile_compare',
    person_entity_id: 'person_compare',
    captured_at: '2026-10-02T00:00:00.000Z',
    sources: [
      {
        source_id: 'source_compare',
        source_type: 'resume',
        source_label: 'compare_fixture.txt',
        blocks: lines.map((text, index) => ({ locator: `line ${index + 1}`, text })),
      },
    ],
  }
}

async function main(): Promise<void> {
  const live = process.argv.includes('--live')
  const models = [CONFIGURED_PARSER_MODELS.haiku, CONFIGURED_PARSER_MODELS.sonnet]
  console.log(`Configured models: ${models.join(', ')}`)
  if (!live) {
    console.log('Live comparison not requested. Re-run with --live to call Anthropic.')
    return
  }

  const env = loadResumeParserEnv()
  if (!env.ANTHROPIC_API_KEY && !env.RESUME_PARSER_ANTHROPIC_API_KEY) {
    console.log('Live comparison not run: ANTHROPIC_API_KEY is missing.')
    return
  }

  const outDir = join(process.cwd(), 'debug', 'resume-parser', 'model-comparison')
  mkdirSync(outDir, { recursive: true })
  const summary: unknown[] = []

  for (const model of models) {
    for (let run = 1; run <= 3; run += 1) {
      process.stdout.write(`${model} run ${run}... `)
      try {
        const result = await runResumeParserOnServer(request(), {
          ...env,
          RESUME_PARSER_MODEL: model,
          RESUME_PARSER_MAX_TOKENS: env.RESUME_PARSER_MAX_TOKENS ?? '8000',
          RESUME_PARSER_DEBUG: '1',
        })
        const profile = result.candidate_profile as unknown as {
          projects: unknown[]
          other_experiences: unknown[]
          experience: unknown[]
        }
        summary.push({
          model,
          run,
          stop_checked_in_debug_artifacts: true,
          project_count: profile.projects?.length ?? 0,
          other_experience_count: profile.other_experiences?.length ?? 0,
          experience_count: profile.experience?.length ?? 0,
          warning_count: result.extraction_report.warnings.length,
        })
        console.log('ok')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        summary.push({ model, run, error: message.slice(0, 300) })
        console.log('failed')
      }
    }
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(`Wrote ${join(outDir, 'summary.json')}`)
}

await main()
