import { useState } from 'react'
import ResumeParserDemo from './ResumeParserDemo'
import ScraperDemo from './ScraperDemo'
import '../styles/DemoPanel.css'

type Demo = 'scraper' | 'parser'

const DEMOS: Array<{ id: Demo; label: string; script: string }> = [
  { id: 'scraper', label: 'Job scraper', script: 'web_scraper/scraper.py' },
  { id: 'parser', label: 'Resume parser', script: 'resume_json_builder (via src/parse_resume.ts)' },
]

export default function DemoPanel() {
  const [demo, setDemo] = useState<Demo>('scraper')
  const current = DEMOS.find((d) => d.id === demo)!

  return (
    <div className="demo-panel">
      <div className="demo-banner">
        <span className="live-dot" aria-hidden="true" />
        <div>
          <strong>Live backend demo</strong>
          <p>
            Calls the real <code>{current.script}</code>, not placeholder data. Needs the dev server
            (<code>npm run dev</code>){demo === 'scraper' ? ' and Python.' : ' and ANTHROPIC_API_KEY in .env.local.'}
          </p>
        </div>
      </div>

      <div className="demo-switch" role="tablist" aria-label="Backend demo">
        {DEMOS.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={demo === d.id}
            className={`demo-tab ${demo === d.id ? 'active' : ''}`}
            onClick={() => setDemo(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Both stay mounted so a result isn't lost when you switch */}
      <div hidden={demo !== 'scraper'}><ScraperDemo /></div>
      <div hidden={demo !== 'parser'}><ResumeParserDemo /></div>
    </div>
  )
}
