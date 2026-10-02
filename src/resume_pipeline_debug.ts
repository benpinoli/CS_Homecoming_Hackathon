import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { ParseResumeApiRequest, ResumeExtraction } from './parse_resume.ts'
import type { FactChange } from './resume_extraction_validate.ts'

export type PipelineDebugArtifacts = {
  input_blocks: ParseResumeApiRequest['sources']
  ingestion_unprocessed_blocks: string[]
  system_prompt: string
  user_prompt: string
  model: string
  generation: {
    temperature: number
    max_tokens: number
  }
  stop_reason: string | null
  raw_model_response: string
  parsed_json: unknown
  final_json: ResumeExtraction
  fact_changes: FactChange[]
}

const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /('x-api-key'\s*:\s*')[^']+(')/g,
]

export function redactSecrets(value: string): string {
  let redacted = value
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, '[redacted]')
  }
  return redacted
}

export function writePipelineDebug(
  artifacts: PipelineDebugArtifacts,
  root = process.cwd(),
): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const directory = join(root, 'debug', 'resume-parser', stamp)
  mkdirSync(directory, { recursive: true })

  const files: Record<string, unknown> = {
    'input-blocks.json': {
      sources: artifacts.input_blocks,
      ingestion_unprocessed_blocks: artifacts.ingestion_unprocessed_blocks,
    },
    'prompts.json': {
      model: artifacts.model,
      generation: artifacts.generation,
      system_prompt: artifacts.system_prompt,
      user_prompt: artifacts.user_prompt,
    },
    'raw-model-response.txt': artifacts.raw_model_response,
    'parsed.json': artifacts.parsed_json,
    'final.json': artifacts.final_json,
    'fact-changes.json': artifacts.fact_changes,
    'stop-reason.json': { stop_reason: artifacts.stop_reason },
  }

  for (const [name, contents] of Object.entries(files)) {
    const text =
      typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
    writeFileSync(join(directory, name), redactSecrets(text), 'utf8')
  }
  return directory
}
