import { useEffect, useState } from 'react'
import AnalyzePage from './AnalyzePage'
import EvaluationPage from './EvaluationPage'

type Tab = 'evaluation' | 'analyze'

export default function App() {
  const [tab, setTab] = useState<Tab>(() => (location.hash === '#analyze' ? 'analyze' : 'evaluation'))

  useEffect(() => {
    const onHash = () => setTab(location.hash === '#analyze' ? 'analyze' : 'evaluation')
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
          <button className="tab" role="tab" aria-selected={tab === 'evaluation'} onClick={() => go('evaluation')}>
            Evaluation
          </button>
          <button className="tab" role="tab" aria-selected={tab === 'analyze'} onClick={() => go('analyze')}>
            Analyze data
          </button>
        </nav>
      </header>
      <main>{tab === 'evaluation' ? <EvaluationPage /> : <AnalyzePage />}</main>
    </>
  )
}
