/**
 * Server-side resume parser (OpenAI). Imported only from Vite dev middleware.
 * Do not import this module from frontend code.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ParseResumeApiRequest, ResumeExtraction } from './parse_resume.ts'

const kitDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'backend/resume_json_builder/resume_bank_kit',
)

function readKitFile(name: string): string {
  return readFileSync(join(kitDir, name), 'utf8')
}

function extractSystemPrompt(sampleConfirmation: string): string {
  const start = sampleConfirmation.indexOf('You extract factual information')
  const end = sampleConfirmation.indexOf('## User-message template')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Could not load resume parser system prompt from kit files.')
  }
  return sampleConfirmation.slice(start, end).trim()
}

function buildUserMessage(payload: ParseResumeApiRequest): string {
  const profileSchema = readKitFile('resume_extraction.schema.json')
  const responseSchema = readKitFile('resume_parser_prompt.md')

  return [
    'PROFILE_SCHEMA:',
    profileSchema,
    '',
    'RESPONSE_SCHEMA:',
    responseSchema,
    '',
    `PROFILE_ID: ${payload.profile_id}`,
    `PERSON_ENTITY_ID: ${payload.person_entity_id}`,
    `CAPTURED_AT: ${payload.captured_at}`,
    '',
    'INPUT_SOURCES:',
    JSON.stringify(payload.sources, null, 2),
  ].join('\n')
}

export async function runResumeParserOnServer(
  payload: ParseResumeApiRequest,
  env: NodeJS.ProcessEnv,
): Promise<ResumeExtraction> {
  const apiKey = env.RESUME_PARSER_OPENAI_API_KEY ?? env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'Set RESUME_PARSER_OPENAI_API_KEY or OPENAI_API_KEY to run resume parsing.',
    )
  }

  const model = env.RESUME_PARSER_MODEL ?? 'gpt-4o-mini'
  const sampleConfirmation = readKitFile('sample_confirmation.txt')
  const systemPrompt = extractSystemPrompt(sampleConfirmation)
  const userMessage = buildUserMessage(payload)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(
      `OpenAI request failed (${response.status}): ${raw.slice(0, 500)}`,
    )
  }

  let completion: {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  try {
    completion = JSON.parse(raw) as typeof completion
  } catch {
    throw new Error('OpenAI returned invalid JSON.')
  }

  const content = completion.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenAI returned an empty parser response.')
  }

  try {
    return JSON.parse(content) as ResumeExtraction
  } catch {
    throw new Error('Parser model returned non-JSON content.')
  }
}
