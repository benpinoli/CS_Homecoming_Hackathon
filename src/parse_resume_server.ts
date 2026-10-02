/**
 * Server-side resume parser (Anthropic Claude). Imported only from Vite dev middleware.
 * Do not import this module from frontend code.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsonrepair } from 'jsonrepair'
import { loadEnv } from 'vite'

import type { ParseResumeApiRequest, ResumeExtraction } from './parse_resume.ts'
import { writePipelineDebug } from './resume_pipeline_debug.ts'
import {
  normalizeResumeExtraction,
  type FactChange,
} from './resume_extraction_validate.ts'

export const CONFIGURED_PARSER_MODELS = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
} as const

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string | null
}

const kitDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'backend/resume_json_builder/resume_bank_kit',
)

const ANTHROPIC_API_VERSION = '2023-06-01'

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
    '',
    'Respond with a single JSON object only. No markdown fences or commentary.',
    'Keep each evidence quote as short as possible while remaining exact.',
  ].join('\n')
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed)
  const unfenced = fenced ? fenced[1].trim() : trimmed
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return unfenced.slice(start, end + 1)
  }
  return unfenced
}

function parseJsonFromModelText(
  text: string,
  stopReason?: string | null,
): ResumeExtraction {
  const candidate = extractJsonCandidate(text)
  const attempts: Array<() => ResumeExtraction> = [
    () => JSON.parse(candidate) as ResumeExtraction,
    () => JSON.parse(jsonrepair(candidate)) as ResumeExtraction,
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      return attempt()
    } catch (error) {
      lastError = error
    }
  }

  if (stopReason === 'max_tokens') {
    throw new Error(
      'Resume parser output was cut off (max tokens). Raise RESUME_PARSER_MAX_TOKENS in .env.local (Haiku 4.5 allows up to 64000), then try again.',
    )
  }

  const detail =
    lastError instanceof Error ? lastError.message : 'Invalid JSON from model'
  throw new Error(
    `Could not parse resume extraction JSON (${detail}). Try again or switch to a larger model via RESUME_PARSER_MODEL.`,
  )
}

async function callAnthropicMessages(
  apiKey: string,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<AnthropicMessageResponse> {
  let response: Response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        system: systemPrompt,
        messages,
      }),
    })
  } catch (error) {
    const cause = error instanceof Error && 'cause' in error ? String(error.cause) : ''
    const message = error instanceof Error ? error.message : 'fetch failed'
    throw new Error(cause ? `${message}: ${cause}` : message)
  }

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(
      `Anthropic request failed (${response.status}): ${raw.slice(0, 500)}`,
    )
  }

  try {
    return JSON.parse(raw) as AnthropicMessageResponse
  } catch {
    throw new Error('Anthropic returned invalid JSON.')
  }
}

function readTextFromAnthropicResponse(
  completion: AnthropicMessageResponse,
): string {
  const textBlock = completion.content?.find((block) => block.type === 'text')
  const content = textBlock?.text?.trim()
  if (!content) {
    throw new Error('Anthropic returned an empty parser response.')
  }
  return content
}

function parseMaxTokens(env: NodeJS.ProcessEnv): number {
  const raw = env.RESUME_PARSER_MAX_TOKENS?.trim()
  if (!raw) {
    return 64_000
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 64_000
}

function unquoteEnvValue(value: string): string {
  let trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1)
  }
  return trimmed.trim()
}

function parseEnvFile(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const normalized = contents.replace(/^\uFEFF/, '')

  for (const line of normalized.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, equalsIndex).trim()
    const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1))
    parsed[key] = value
  }

  return parsed
}

function readEnvFilesFromDisk(projectRoot: string): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const fileName of ['.env', '.env.local']) {
    const filePath = join(projectRoot, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    Object.assign(merged, parseEnvFile(readFileSync(filePath, 'utf8')))
  }
  return merged
}

/** Load env for the dev parser API (disk files + Vite loadEnv + process.env). */
export function loadResumeParserEnv(
  projectRoot: string = process.cwd(),
  mode = 'development',
): NodeJS.ProcessEnv {
  const fromDisk = readEnvFilesFromDisk(projectRoot)
  const fromVite = loadEnv(mode, projectRoot, '')
  return {
    ...process.env,
    ...fromVite,
    ...fromDisk,
  }
}

export function anthropicApiKeyStatus(env: NodeJS.ProcessEnv): {
  loaded: boolean
  length: number
} {
  const key = readAnthropicApiKey(env)
  return { loaded: Boolean(key), length: key?.length ?? 0 }
}

function readAnthropicApiKey(env: NodeJS.ProcessEnv): string | undefined {
  const raw =
    env.RESUME_PARSER_ANTHROPIC_API_KEY ??
    env.ANTHROPIC_API_KEY ??
    env.CLAUDE_API_KEY ??
    ''
  const trimmed = unquoteEnvValue(raw)
  return trimmed.length > 0 ? trimmed : undefined
}

export async function runResumeParserOnServer(
  payload: ParseResumeApiRequest,
  env: NodeJS.ProcessEnv,
): Promise<ResumeExtraction> {
  const apiKey = readAnthropicApiKey(env)
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is missing or empty in .env.local (project root). Use ANTHROPIC_API_KEY=sk-ant-... or ANTHROPIC_API_KEY="sk-ant-..." with no JSON wrapper, save the file, then restart npm run dev.',
    )
  }

  const model = env.RESUME_PARSER_MODEL ?? 'claude-haiku-4-5'
  const maxTokens = parseMaxTokens(env)
  const sampleConfirmation = readKitFile('sample_confirmation.txt')
  const systemPrompt = extractSystemPrompt(sampleConfirmation)
  const userMessage = buildUserMessage(payload)

  let completion = await callAnthropicMessages(
    apiKey,
    model,
    maxTokens,
    systemPrompt,
    [{ role: 'user', content: userMessage }],
  )
  let content = readTextFromAnthropicResponse(completion)

  const finish = (modelText: string, stopReason: string | null | undefined) => {
    const parsed = parseJsonFromModelText(modelText, stopReason)
    const factChanges: FactChange[] = []
    const finalJson = normalizeResumeExtraction(parsed, payload, factChanges)
    if (env.RESUME_PARSER_DEBUG !== '0') {
      writePipelineDebug({
        input_blocks: payload.sources,
        ingestion_unprocessed_blocks: payload.ingestion_unprocessed_blocks ?? [],
        system_prompt: systemPrompt,
        user_prompt: userMessage,
        model,
        generation: { temperature: 0, max_tokens: maxTokens },
        stop_reason: stopReason ?? null,
        raw_model_response: modelText,
        parsed_json: parsed,
        final_json: finalJson,
        fact_changes: factChanges,
      })
    }
    return finalJson
  }

  try {
    return finish(content, completion.stop_reason)
  } catch (firstError) {
    if (!(firstError instanceof Error)) {
      throw firstError
    }

    completion = await callAnthropicMessages(
      apiKey,
      model,
      maxTokens,
      'You fix malformed JSON. Return only valid JSON with no markdown or commentary.',
      [
        {
          role: 'user',
          content: [
            'The following resume extraction JSON failed to parse.',
            'Repair it so it is valid JSON and preserve as much data as possible.',
            'Return only the corrected JSON object.',
            '',
            content.slice(0, 120_000),
          ].join('\n'),
        },
      ],
    )
    content = readTextFromAnthropicResponse(completion)
    try {
      return finish(content, completion.stop_reason)
    } catch {
      throw firstError
    }
  }
}
