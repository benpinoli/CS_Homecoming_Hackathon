import { useRef, useState } from 'react'
import JsonViewer from './JsonViewer'
import { parseResumeReal } from '../lib/backend'

// What parse_resume() can read (src/parse_resume.ts)
const ALLOWED = ['pdf', 'txt', 'text', 'md', 'markdown']
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = ALLOWED.map((e) => `.${e}`).join(',')

/** Pull a few headline numbers out of the parser's JSON, if it has the known shape */
function highlights(json: unknown) {
  const root = json as Record<string, unknown> | null
  const profile = (root?.candidate_profile ?? root) as Record<string, unknown> | null
  const counts: Array<[string, number]> = []
  if (profile && typeof profile === 'object') {
    for (const [k, v] of Object.entries(profile)) if (Array.isArray(v)) counts.push([k, v.length])
  }
  const warnings = (root?.extraction_report as { warnings?: unknown } | undefined)?.warnings
  return { counts, warnings: Array.isArray(warnings) ? (warnings as string[]) : [] }
}

export default function ResumeParserDemo() {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const choose = (files: FileList | null) => {
    const f = files?.[0]
    setError('')
    setResult(null)
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED.includes(ext)) {
      setFile(null)
      setFileError('That file type isn’t supported. The parser reads PDF, text and Markdown files.')
    } else if (f.size === 0) {
      setFile(null)
      setFileError('That file is empty.')
    } else if (f.size > MAX_BYTES) {
      setFile(null)
      setFileError('That file is larger than 10 MB.')
    } else {
      setFile(f)
      setFileError('')
    }
  }

  const run = async () => {
    if (!file) {
      setFileError('Choose a resume file first.')
      return
    }
    setError('')
    setResult(null)
    setLoading(true)
    const started = performance.now()
    try {
      setResult(await parseResumeReal(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setElapsed(Math.round(performance.now() - started))
      setLoading(false)
    }
  }

  const { counts, warnings } = result ? highlights(result) : { counts: [], warnings: [] }
  const size = result ? new Blob([JSON.stringify(result)]).size : 0

  return (
    <div className="demo-section">
      <div className="job-form">
        <div className={`form-group${fileError ? ' has-error' : ''}`}>
          <label htmlFor="demo-resume">Resume file</label>
          <input
            ref={input}
            id="demo-resume"
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => choose(e.target.files)}
          />
          <div className="file-row">
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => input.current?.click()}>
              {file ? 'Choose a different file' : 'Choose file'}
            </button>
            <span className="file-name">{file ? file.name : 'PDF, text or Markdown, up to 10 MB'}</span>
          </div>
          {fileError && <span className="field-error" role="alert">{fileError}</span>}
        </div>
        <button className="btn btn-primary" disabled={loading} onClick={run}>
          {loading ? 'Parsing…' : 'Parse Resume'}
        </button>
        {error && <div className="error-message" role="alert">{error}</div>}
      </div>

      {loading && (
        <div className="demo-loading" role="status">
          <span className="spinner" aria-hidden="true" /> Reading the file and asking the model. This can take a minute…
        </div>
      )}

      {result !== null && (
        <section className="demo-result">
          <div className="demo-result-head">
            <h2>Parser Output</h2>
          </div>

          {result && (
            <>
              <dl className="demo-stats">
                <div><dt>File</dt><dd>{file?.name}</dd></div>
                <div><dt>JSON size</dt><dd>{(size / 1024).toFixed(1)} KB</dd></div>
                <div><dt>Time</dt><dd>{(elapsed / 1000).toFixed(1)}s</dd></div>
              </dl>

              {counts.length > 0 && (
                <ul className="import-counts">
                  {counts.map(([k, n]) => <li key={k}>{k}: {n}</li>)}
                </ul>
              )}
              {warnings.length > 0 && (
                <ul className="import-warnings">
                  {warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}

              <JsonViewer value={result} />
            </>
          )}

        </section>
      )}
    </div>
  )
}
