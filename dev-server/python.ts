import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** PYTHON env var, else the project's .venv if it exists, else system python3 */
export function pythonPath(): string {
  if (process.env.PYTHON) return process.env.PYTHON
  for (const rel of ['../.venv/bin/python', '../.venv/Scripts/python.exe']) {
    const candidate = fileURLToPath(new URL(rel, import.meta.url))
    if (existsSync(candidate)) return candidate
  }
  return 'python3'
}
