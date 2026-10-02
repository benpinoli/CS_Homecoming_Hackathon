import { useState } from 'react'
import './App.css'
import ResumeMatcher from './components/ResumeMatcher'
import DataManager from './components/DataManager'
import MyResumes from './components/MyResumes'
import DemoPanel from './components/DemoPanel'
import { DEV } from './dev'
import { DEFAULT_APPEARANCE } from './types'
import type { BankPhoto, SavedResume } from './types'

type Tab = 'matcher' | 'data' | 'resumes' | 'demo'

const STORAGE_KEY = 'resume-inator.saved-resumes'
const PHOTOS_KEY = 'resume-inator.photos'

const loadSaved = (): SavedResume[] => {
  try {
    const items: SavedResume[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    // Resumes saved before appearance was split into layout/font/color
    return items.map((r) => ({ ...r, appearance: r.appearance ?? DEFAULT_APPEARANCE }))
  } catch {
    return []
  }
}

const loadPhotos = (): BankPhoto[] => {
  try {
    return JSON.parse(localStorage.getItem(PHOTOS_KEY) ?? '[]')
  } catch {
    return []
  }
}

function AtomLogo() {
  return (
    <svg className="atom-logo" viewBox="0 0 64 64" aria-hidden="true">
      <ellipse className="orbit orbit-1" cx="32" cy="32" rx="28" ry="10" />
      <ellipse className="orbit orbit-2" cx="32" cy="32" rx="28" ry="10" />
      <ellipse className="orbit orbit-3" cx="32" cy="32" rx="28" ry="10" />
      <g className="electrons">
        <circle className="electron" cx="60" cy="32" r="2.5" />
        <circle className="electron" cx="18" cy="56.2" r="2.5" />
        <circle className="electron" cx="18" cy="7.8" r="2.5" />
      </g>
      <circle className="nucleus" cx="32" cy="32" r="5" />
    </svg>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('matcher')
  const [saved, setSaved] = useState<SavedResume[]>(loadSaved)
  const [photos, setPhotos] = useState<BankPhoto[]>(loadPhotos)
  const updatePhotos = (next: BankPhoto[]) => {
    setPhotos(next)
    try {
      localStorage.setItem(PHOTOS_KEY, JSON.stringify(next))
    } catch { /* storage full or unavailable; keep in memory */ }
  }

  const updateSaved = (next: SavedResume[]) => {
    setSaved(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch { /* storage unavailable; keep in memory */ }
  }

  const saveResume = (entry: Omit<SavedResume, 'id' | 'savedAt'>) =>
    updateSaved([
      { ...entry, id: Date.now().toString(), savedAt: new Date().toISOString() },
      ...saved,
    ])

  return (
    <div className="app-container">
      <div className="app-banner">
      <header className="app-header">
        <AtomLogo />
        <div>
          <h1>Resume-inator</h1>
          <p>Tailor your resume to every job listing</p>
        </div>
      </header>
      </div>

      <nav className="tab-nav">
        <div className="tab-nav-inner">
          <button
            className={`tab-button ${activeTab === 'matcher' ? 'active' : ''}`}
            onClick={() => setActiveTab('matcher')}
          >
            Resume Matcher
          </button>
          <button
            className={`tab-button ${activeTab === 'data' ? 'active' : ''}`}
            onClick={() => setActiveTab('data')}
          >
            Data Bank
          </button>
          <button
            className={`tab-button ${activeTab === 'resumes' ? 'active' : ''}`}
            onClick={() => setActiveTab('resumes')}
          >
            My Resumes
          </button>
          {DEV.showDemoTab && (
            <button
              className={`tab-button ${activeTab === 'demo' ? 'active' : ''}`}
              onClick={() => setActiveTab('demo')}
            >
              Demo
            </button>
          )}
        </div>
      </nav>

      {/* All tabs stay mounted (just hidden) so in-progress work survives switching tabs */}
      <main className="app-content">
        <div hidden={activeTab !== 'matcher'}>
          <ResumeMatcher saved={saved} photoBank={photos} onPhotoBankChange={updatePhotos} onSave={saveResume} onViewSaved={() => setActiveTab('resumes')} />
        </div>
        <div hidden={activeTab !== 'data'}>
          <DataManager photos={photos} onPhotosChange={updatePhotos} />
        </div>
        <div hidden={activeTab !== 'resumes'}>
          <MyResumes
            resumes={saved}
            photoBank={photos}
            onPhotoBankChange={updatePhotos}
            onUpdate={(id, patch) => updateSaved(saved.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
            onDelete={(id) => updateSaved(saved.filter((r) => r.id !== id))}
          />
        </div>
        {DEV.showDemoTab && (
          <div hidden={activeTab !== 'demo'}>
            <DemoPanel />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
