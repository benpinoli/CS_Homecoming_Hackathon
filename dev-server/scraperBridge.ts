import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/**
 * Dev-only bridge so the browser can use src/backend/web_scraper/scraper.py.
 *
 * GET /api/scrape?url=<job listing url>  ->  { url, job_description }  |  { error }
 *
 * The script is run unmodified: it reads the URL from stdin and writes job_posting.json to its
 * working directory, so each request gets a throwaway temp directory.
 * Set the PYTHON env var to choose the interpreter (default: python3).
 */
const SCRAPER = fileURLToPath(new URL('../src/backend/web_scraper/scraper.py', import.meta.url))
const TIMEOUT_MS = 30_000

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

      const python = process.env.PYTHON ?? 'python3'
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
          const lastLine = stderr.trim().split('\n').pop() ?? ''
          const message = /No module named/.test(lastLine)
            ? `${lastLine}. Install the scraper’s Python packages: pip install requests beautifulsoup4`
            : lastLine || 'The scraper failed.'
          return done({ status: 502, body: { error: message } })
        }
        try {
          const data = JSON.parse(await readFile(join(dir, 'job_posting.json'), 'utf-8'))
          if (!data.job_description) {
            return done({
              status: 422,
              body: { error: 'The scraper couldn’t find a job description on that page. It currently reads LinkedIn-style job listings.' },
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
