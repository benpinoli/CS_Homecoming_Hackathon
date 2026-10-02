import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { pythonPath } from './python.ts'

/**
 * Dev-only bridge so the browser can use src/backend/web_scraper/scraper.py.
 *
 * GET /api/scrape?url=<job listing url>
 *   ->  { url, title, company, location, job_description, source }  |  { error }
 *
 * The script reads the URL from stdin and writes job_posting.json to its working directory,
 * so each request gets a throwaway temp directory.
 * Interpreter: the PYTHON env var if set, else web_scraper/.venv if it exists, else python/python3.
 */
const SCRAPER_DIR = fileURLToPath(new URL('../src/backend/web_scraper/', import.meta.url))
const SCRAPER = join(SCRAPER_DIR, 'scraper.py')
const TIMEOUT_MS = 45_000

function pythonCommand(): string {
  if (process.env.PYTHON) return process.env.PYTHON
  const isWindows = process.platform === 'win32'
  const venvPython = join(SCRAPER_DIR, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python')
  if (existsSync(venvPython)) return venvPython
  // On Windows "python3" is often the Microsoft Store stub, so prefer "python" there.
  return isWindows ? 'python' : 'python3'
}

interface Outcome {
  status: number
  body: Record<string, unknown>
}

function run(url: string): Promise<Outcome> {
  return new Promise((resolve) => {
    mkdtemp(join(tmpdir(), 'scrape-')).then((dir) => {
      const done = (outcome: Outcome) => {
        rm(dir, { recursive: true, force: true }).catch(() => {})
        resolve(outcome)
      }

      const python = pythonCommand()
      const child = spawn(python, [SCRAPER], { cwd: dir })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        done({ status: 504, body: { error: 'The scraper took too long to respond.' } })
      }, TIMEOUT_MS)

      child.stdout.on('data', (d) => (stdout += d))
      child.stderr.on('data', (d) => (stderr += d))
      child.on('error', () => {
        clearTimeout(timer)
        done({ status: 500, body: { error: `Couldn’t start Python (“${python}”). Install Python 3 or set the PYTHON environment variable.` } })
      })
      child.on('close', async (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          const lastLine = stderr.trim().split('\n').pop()?.trim() ?? ''
          // scraper.py reports expected failures (blocked site, no description found) as "Error: ..."
          if (lastLine.startsWith('Error: ')) {
            return done({ status: 422, body: { error: lastLine.slice('Error: '.length) } })
          }
          const message = /No module named/.test(lastLine)
            ? `${lastLine}. Install the scraper’s Python packages: pip install -r src/backend/web_scraper/requirements.txt`
            : lastLine || 'The scraper failed.'
          return done({ status: 502, body: { error: message } })
        }
        try {
          const data = JSON.parse(await readFile(join(dir, 'job_posting.json'), 'utf-8'))
          if (!data.job_description) {
            return done({
              status: 422,
              body: {
                error:
                  data.warning ||
                  'The scraper ran but could not find a job description. Paste the description instead if the page requires a login or JavaScript.',
                data,
                log: stdout.trim(),
              },
            })
          }
          done({ status: 200, body: data })
        } catch {
          done({ status: 502, body: { error: `The scraper produced no result. ${stdout.trim()}`.trim() } })
        }
      })

      child.stdin.write(`${url}\n`)
      child.stdin.end()
    })
  })
}

export function scraperBridge(): Plugin {
  return {
    name: 'scraper-bridge',
    configureServer(server) {
      server.middlewares.use('/api/scrape', async (req, res) => {
        const send = ({ status, body }: Outcome) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        const target = new URL(req.url ?? '', 'http://localhost').searchParams.get('url') ?? ''
        if (!/^https?:\/\//i.test(target)) return send({ status: 400, body: { error: 'Provide an http(s) job listing URL.' } })
        send(await run(target))
      })
    },
  }
}
