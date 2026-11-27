import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeApi as api, type Job, type LoadedDataset, type ModelInfo, type Row } from './api'
import { ResultsView } from './ResultsView'

const DEMO_URL = 'sqlite:///app/demo/mildec_demo.db'

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function cell(v: Row[string]) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  return String(v)
}

function eta(seconds: number | null) {
  if (seconds === null) return 'estimating time…'
  if (seconds < 60) return `about ${seconds}s left`
  return `about ${Math.round(seconds / 60)} min left`
}

/* ------------------------------------------------------------ step 1: source */

function SourcePicker({ onLoaded }: { onLoaded: (d: LoadedDataset, sqlUrl: string | null) => void }) {
  const [kind, setKind] = useState<'sql' | 'csv'>('sql')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState('')
  const [tables, setTables] = useState<{ name: string; columns: string[] }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  const showTables = () => run(async () => setTables((await api.sqlTables(url)).tables))
  const loadSql = () => run(async () => onLoaded(await api.sqlLoad(url, query), url))
  const loadCsv = (file: File) => run(async () => onLoaded(await api.csvLoad(file), null))

  return (
    <div className="card">
      <div className="card-head">
        <h2>1. Load data</h2>
        <span className="seg">
          <button aria-pressed={kind === 'sql'} onClick={() => setKind('sql')}>SQL database</button>
          <button aria-pressed={kind === 'csv'} onClick={() => setKind('csv')}>CSV file</button>
        </span>
      </div>

      {kind === 'sql' ? (
        <div className="stack">
          <label className="field">
            Connection URL (SQLAlchemy format)
            <input
              type="password"
              autoComplete="off"
              placeholder="sqlite:///path/to/file.db  ·  postgresql+psycopg://user:pass@host/db  ·  mysql+pymysql://user:pass@host/db"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="row small">
            <button className="btn" disabled={!url || busy} onClick={showTables}>Show tables</button>
            <button
              className="link"
              onClick={() => {
                setUrl(DEMO_URL)
                setQuery('SELECT * FROM mildec_short LIMIT 200')
                setTables(null)
              }}
            >
              Use the MILDEC demo database
            </button>
            <span className="muted">The URL is hidden as you type and is never saved.</span>
          </div>
          {tables && (
            <div className="row small">
              {tables.length === 0 && <span className="muted">No tables found.</span>}
              {tables.map((t) => (
                <button key={t.name} className="btn" title={t.columns.join(', ')} onClick={() => setQuery(`SELECT * FROM ${t.name} LIMIT 500`)}>
                  {t.name} <span className="muted">({t.columns.length} cols)</span>
                </button>
              ))}
            </div>
          )}
          <label className="field">
            Query (read-only: one SELECT statement, up to 20,000 rows)
            <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SELECT id, text, tick FROM posts WHERE tick < 20" />
          </label>
          <div className="row">
            <button className="btn primary" disabled={!url || !query || busy} onClick={loadSql}>
              {busy ? 'Loading…' : 'Load rows'}
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && loadCsv(e.target.files[0])}
          />
          {busy && <span className="muted">Loading…</span>}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

/* ------------------------------------------------------------ page */

export default function AnalyzePage() {
  const [dataset, setDataset] = useState<LoadedDataset | null>(null)
  const [sqlUrl, setSqlUrl] = useState<string | null>(null)
  const [textColumn, setTextColumn] = useState('')
  const [model, setModel] = useState<'v1' | 'v2'>('v2')
  const [models, setModels] = useState<Record<string, ModelInfo>>({})
  const [job, setJob] = useState<Job | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.models().then(setModels, () => {})
  }, [])

  useEffect(() => {
    if (!jobId) return
    let stop = false
    const tick = async () => {
      try {
        const j = await api.job(jobId)
        if (stop) return
        setJob(j)
        if (j.status !== 'done' && j.status !== 'error') setTimeout(tick, 1000)
      } catch (e) {
        if (!stop) setError(errText(e))
      }
    }
    tick()
    return () => {
      stop = true
    }
  }, [jobId])

  async function start() {
    if (!dataset) return
    setError(null)
    setJob(null)
    try {
      const { job_id } = await api.startJob(dataset.dataset_id, textColumn, model)
      setJobId(job_id)
    } catch (e) {
      setError(errText(e))
    }
  }

  const loadResults = useCallback((group?: string) => api.results(jobId!, group), [jobId])
  const saveResults = useCallback(
    async (table: string) => {
      const r = await api.saveToSql(jobId!, sqlUrl!, table)
      return `Saved ${r.rows} rows to table "${r.table}".`
    },
    [jobId, sqlUrl],
  )

  const running = job && job.status !== 'done' && job.status !== 'error'
  const pct = job?.total ? Math.round((job.done / job.total) * 100) : 0

  return (
    <>
      <div className="stack">
        <h1>Analyze your own data</h1>
        <p className="lede">Load posts from a SQL database or a CSV, pick the text column, and score every post for fear, stress, morale and trust.</p>
      </div>

      <SourcePicker
        onLoaded={(d, url) => {
          setDataset(d)
          setSqlUrl(url)
          setTextColumn(d.text_column_guess ?? d.columns[0])
          setJob(null)
          setJobId(null)
        }}
      />

      {dataset && (
        <div className="card">
          <div className="card-head">
            <h2>2. Choose what to score</h2>
            <span className="note">{dataset.rows.toLocaleString()} rows loaded · first 20 shown</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 260 }}>
            <table>
              <thead>
                <tr>{dataset.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {dataset.preview.map((r, i) => (
                  <tr key={i}>
                    {dataset.columns.map((c) => (
                      <td key={c} className={c === textColumn ? 'text' : undefined}>{cell(r[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ alignItems: 'end' }}>
            <label className="field" style={{ minWidth: 220 }}>
              Text column
              <select value={textColumn} onChange={(e) => setTextColumn(e.target.value)}>
                {dataset.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="field">
              Model
              <span className="seg">
                <button aria-pressed={model === 'v2'} onClick={() => setModel('v2')}>v2 · zero-shot NLU</button>
                <button aria-pressed={model === 'v1'} onClick={() => setModel('v1')}>v1 · emotion</button>
              </span>
            </div>
            <button className="btn primary" onClick={start} disabled={!!running}>
              {running ? 'Running…' : `Score ${dataset.rows.toLocaleString()} posts`}
            </button>
          </div>
          {models[model] && (
            <p className="small muted">
              {models[model].label}. Model <code>{models[model].model}</code>, {models[model].scale}.
              {model === 'v2' && ' Without a GPU it takes about 3 seconds per post (1,000 posts ≈ 1 hour); with a GPU, under a minute.'}
            </p>
          )}
          {job && running && (
            <div className="stack">
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <span className="small muted">
                {job.status === 'running' && job.total ? `${job.done} of ${job.total} posts · ${eta(job.eta_seconds)}` : 'Loading model (first run downloads it)…'}
              </span>
            </div>
          )}
          {job?.status === 'error' && <div className="error">{job.error}</div>}
          {error && <div className="error">{error}</div>}
        </div>
      )}

      {job?.status === 'done' && jobId && dataset && (
        <ResultsView
          key={jobId}
          load={loadResults}
          model={job.model}
          columns={dataset.columns}
          heading="3. Results"
          csvHref={api.csvUrl(jobId)}
          onSave={sqlUrl ? saveResults : undefined}
        />
      )}
    </>
  )
}
