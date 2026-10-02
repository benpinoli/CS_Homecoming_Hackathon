import { useRef, useState, type ChangeEvent } from 'react'
import { parse_resume, ParseResumeError } from '../parse_resume.ts'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  const [parseResult, setParseResult] = useState<unknown | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runParse = async (file: File) => {
    setIsLoading(true)
    setParseResult(null)
    setSelectedFileName(file.name)
    try {
      const result = await parse_resume(file)
      setParseResult(result)
    } catch (error) {
      if (error instanceof ParseResumeError) {
        setParseResult({
          error: error.message,
          status: error.status,
        })
      } else {
        setParseResult({ error: String(error) })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handlePickResume = () => {
    fileInputRef.current?.click()
  }

  const handleResumeSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    await runParse(file)
    event.target.value = ''
  }

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.text,.md,.markdown,.pdf"
          onChange={handleResumeSelected}
          style={{ display: 'none' }}
          aria-hidden
        />
        <button
          type="button"
          onClick={handlePickResume}
          disabled={isLoading}
          style={{ marginLeft: '10px' }}
        >
          {isLoading ? 'Parsing…' : 'Parse resume'}
        </button>
        <p
          style={{
            marginTop: '12px',
            fontSize: '0.85rem',
            maxWidth: '28rem',
            opacity: 0.85,
          }}
        >
          Choose a <strong>.pdf</strong> or <strong>.txt</strong> resume. Set{' '}
          <code>ANTHROPIC_API_KEY=&quot;sk-ant-...&quot;</code> in{' '}
          <code>.env.local</code> at the project root (plain line, not JSON).
        </p>
        {selectedFileName && (
          <p style={{ marginTop: '8px', fontSize: '0.9rem' }}>
            {isLoading ? 'Parsing' : 'Last file'}: {selectedFileName}
          </p>
        )}
        {parseResult !== null && (
          <pre style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0', borderRadius: '4px', maxHeight: '400px', overflow: 'auto' }}>
            {JSON.stringify(parseResult, null, 2)}
          </pre>
        )}
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
