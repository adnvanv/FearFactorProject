import { lazy, Suspense, useEffect, useState } from 'react'
import { PUBLIC } from './api'
import EvaluationPage from './EvaluationPage'
import MildecPage from './MildecPage'

type Tab = 'evaluation' | 'mildec' | 'analyze'

// Loaded on demand, and left out of the public build entirely.
const AnalyzePage = import.meta.env.VITE_PUBLIC === '1' ? null : lazy(() => import('./AnalyzePage'))

// The public build is view-only: no Analyze page (it needs the Python API and models).
const TABS: { id: Tab; label: string }[] = [
  { id: 'evaluation', label: 'Evaluation' },
  { id: 'mildec', label: 'MILDEC results' },
  ...(PUBLIC ? [] : [{ id: 'analyze' as Tab, label: 'Analyze data' }]),
]

function tabFromHash(): Tab {
  const id = location.hash.slice(1)
  return TABS.find((t) => t.id === id)?.id ?? 'evaluation'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1 style={{ fontSize: 17 }}>FSMT Analyzer</h1>
          <div className="sub">Fear · Stress · Morale · Trust from text</div>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {tab === 'evaluation' && <EvaluationPage />}
        {tab === 'mildec' && <MildecPage />}
        {tab === 'analyze' && AnalyzePage && (
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <AnalyzePage />
          </Suspense>
        )}
      </main>
    </>
  )
}
