import { useState } from 'react'
import Field from './Field'
import { scrapeJobReal } from '../lib/backend'
import type { ScrapedJob } from '../lib/backend'
import { validateJobUrl } from '../lib/validate'
import '../styles/DemoPanel.css'

type View = 'formatted' | 'raw'

const BULLET = /^\s*([•\-*–·])\s+/
const TERMINAL = /[.!?:;]$/
const FUNCTION_WORD = /\b(a|an|the|of|to|and|or|in|for|with|on|at|by|as|our|your|their|is|are)$/i
const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length

type Block = { kind: 'h' | 'p'; text: string } | { kind: 'ul'; items: string[] }

/**
 * The scraper emits one line per HTML element, so inline markup (bold, links) chops sentences into
 * fragments. Stitch them back together, group bullets, and treat short unpunctuated lines as headings.
 */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let para = ''
  const flush = () => {
    if (!para) return
    const short = wordCount(para) <= 6 && !TERMINAL.test(para) && !para.endsWith(',')
    blocks.push({ kind: short ? 'h' : 'p', text: para })
    para = ''
  }

  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (BULLET.test(line)) {
      flush()
      const item = line.replace(BULLET, '')
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ul') last.items.push(item)
      else blocks.push({ kind: 'ul', items: [item] })
      continue
    }
    if (/^[.,;:)]/.test(line) && para) {
      para += line // punctuation that was split off by a tag
      continue
    }
    const continues =
      para &&
      !TERMINAL.test(para) &&
      (/^[a-z]/.test(line) || FUNCTION_WORD.test(para) || wordCount(para) > 6)
    if (continues) para += ` ${line}`
    else {
      flush()
      para = line
    }
  }
  flush()
  return blocks
}

function Formatted({ text }: { text: string }) {
  return (
    <div className="demo-formatted">
      {toBlocks(text).map((b, i) =>
        b.kind === 'ul' ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        ) : b.kind === 'h' ? (
          <h4 key={i}>{b.text}</h4>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  )
}

export default function DemoPanel() {
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScrapedJob | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [view, setView] = useState<View>('formatted')
  const [copied, setCopied] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateJobUrl(url)
    setUrlError(problem)
    if (problem) return
    setError('')
    setResult(null)
    setLoading(true)
    const started = performance.now()
    try {
      setResult(await scrapeJobReal(url.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setElapsed(Math.round(performance.now() - started))
      setLoading(false)
    }
  }

  const raw = result ? JSON.stringify(result, null, 2) : ''
  const words = result ? result.job_description.split(/\s+/).filter(Boolean).length : 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="demo-panel">
      <div className="demo-banner">
        <span className="live-dot" aria-hidden="true" />
        <div>
          <strong>Live backend demo</strong>
          <p>
            Calls the real <code>web_scraper/scraper.py</code>, not placeholder data. Needs the dev server
            (<code>npm run dev</code>) and Python with <code>requests</code> and <code>beautifulsoup4</code>.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="job-form" noValidate>
        <Field
          id="demo-url"
          label="Job Listing URL"
          type="url"
          value={url}
          required
          error={urlError}
          disabled={loading}
          placeholder="https://www.linkedin.com/jobs/view/…"
          onChange={(v) => { setUrl(v); if (urlError) setUrlError('') }}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Scraping…' : 'Scrape Listing'}
        </button>
        {error && <div className="error-message" role="alert">{error}</div>}
      </form>

      {loading && (
        <div className="demo-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Running the scraper…
        </div>
      )}

      {result && (
        <section className="demo-result">
          <div className="demo-result-head">
            <h2>Scraper Response</h2>
            <div className="demo-tabs" role="tablist" aria-label="Response view">
              {(['formatted', 'raw'] as View[]).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={`demo-tab ${view === v ? 'active' : ''}`}
                  onClick={() => setView(v)}
                >
                  {v === 'formatted' ? 'Formatted' : 'Raw JSON'}
                </button>
              ))}
            </div>
          </div>

          <dl className="demo-stats">
            <div><dt>Source</dt><dd><a href={result.url} target="_blank" rel="noreferrer">{result.url}</a></dd></div>
            <div><dt>Words</dt><dd>{words.toLocaleString()}</dd></div>
            <div><dt>Characters</dt><dd>{result.job_description.length.toLocaleString()}</dd></div>
            <div><dt>Time</dt><dd>{(elapsed / 1000).toFixed(1)}s</dd></div>
          </dl>

          {view === 'formatted' ? (
            <Formatted text={result.job_description} />
          ) : (
            <div className="demo-raw">
              <button className="btn btn-secondary" onClick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
              <pre>{raw}</pre>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
