import { useEffect, useMemo, useState } from 'react'
import { DIMENSIONS, DIM_COLOR, DIM_LABEL, type JobResults, type Row } from './api'
import { Histogram, LineChart } from './charts'

function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function cell(v: Row[string]) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3)
  return String(v)
}

const scoreColOf = (res: JobResults | null, dim: string) => res?.score_columns.find((c) => c.endsWith(`_${dim}`)) ?? ''

export function ResultsView({
  load,
  model,
  columns,
  heading,
  note,
  csvHref,
  onSave,
}: {
  /** Returns results; may be called again with a group column. Must be stable (useCallback). */
  load: (group?: string) => Promise<JobResults>
  model: 'v1' | 'v2'
  columns: string[]
  heading: string
  note?: string
  csvHref?: string
  onSave?: (table: string) => Promise<string>
}) {
  const [group, setGroup] = useState(columns.includes('tick') ? 'tick' : '')
  const [res, setRes] = useState<JobResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string>('')
  const [table, setTable] = useState('fsmt_results')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    load(group || undefined).then(setRes, (e) => setError(errText(e)))
  }, [load, group])


  const scoreCol = (dim: string) => scoreColOf(res, dim)

  const byGroup = useMemo(() => {
    if (!res || !group) return null
    const acc = new Map<string, Record<string, { sum: number; n: number }>>()
    for (const r of res.rows) {
      const g = r[group]
      if (g === null || g === undefined) continue
      const key = String(g)
      if (!acc.has(key)) acc.set(key, {})
      const bucket = acc.get(key)!
      for (const d of DIMENSIONS) {
        const v = r[scoreColOf(res, d)]
        if (typeof v !== 'number') continue
        bucket[d] ??= { sum: 0, n: 0 }
        bucket[d].sum += v
        bucket[d].n++
      }
    }
    const keys = [...acc.keys()]
    const numeric = keys.every((k) => !isNaN(Number(k)))
    keys.sort((a, b) => (numeric ? Number(a) - Number(b) : a.localeCompare(b)))
    if (keys.length > 200) return { tooMany: keys.length }
    return {
      xs: keys,
      series: DIMENSIONS.map((d) => ({
        key: d,
        label: DIM_LABEL[d],
        color: DIM_COLOR[d],
        values: keys.map((k) => {
          const b = acc.get(k)![d]
          return b ? b.sum / b.n : null
        }),
      })),
    }
  }, [res, group])

  const sorted = useMemo(() => {
    if (!res) return []
    const rows = [...res.rows]
    if (sortBy) rows.sort((a, b) => ((b[sortBy] as number) ?? -Infinity) - ((a[sortBy] as number) ?? -Infinity))
    return rows.slice(0, 300)
  }, [res, sortBy])

  if (error) return <div className="error">{error}</div>
  if (!res) return <p className="muted">Loading results…</p>

  const values = (d: string) => res.rows.map((r) => r[scoreCol(d)]).filter((v): v is number => typeof v === 'number')

  async function save() {
    setSaveMsg(null)
    try {
      setSaveMsg(await onSave!(table))
    } catch (e) {
      setSaveMsg(errText(e))
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>{heading}</h2>
          <span className="note">
            {res.rows.length} posts ·{' '}
            {model === 'v2' ? 'scores from −1 (low) to +1 (high)' : 'levels 1 (low) to 3 (high)'}
          </span>
          <span style={{ marginLeft: 'auto' }} className="row">
            {csvHref && (
              <a className="btn" href={csvHref} download>
                Download CSV
              </a>
            )}
          </span>
        </div>
        {note && <p className="small muted">{note}</p>}
        <div className="grid-2">
          {DIMENSIONS.map((d) => (
            <Histogram key={d} title={DIM_LABEL[d]} values={values(d)} color={DIM_COLOR[d]} discrete={model === 'v1' ? [1, 2, 3] : undefined} />
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Averages over time or by group</h2>
          <label className="field" style={{ marginLeft: 'auto', minWidth: 220 }}>
            Group by column
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">(none)</option>
              {columns.filter((c) => c !== res.text_column).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        {!group && <p className="muted small">Pick a column such as <code>tick</code> or <code>timestamp</code> to see how the average scores change.</p>}
        {byGroup && 'tooMany' in byGroup && (
          <p className="muted small">That column has {byGroup.tooMany} different values. Pick one with fewer than 200 groups.</p>
        )}
        {byGroup && 'xs' in byGroup && byGroup.xs && (
          <LineChart xs={byGroup.xs} series={byGroup.series} xLabel={group} yDomain={model === 'v2' ? [-1, 1] : [1, 3]} signed={model === 'v2'} />
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Posts</h2>
          <span className="note">Click a score column to sort highest first. Showing up to 300 rows{csvHref ? '; download the CSV for all' : ''}.</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{res.text_column}</th>
                {DIMENSIONS.map((d) => (
                  <th key={d} className="num sortable" onClick={() => setSortBy(scoreCol(d))} aria-sort={sortBy === scoreCol(d) ? 'descending' : 'none'}>
                    {DIM_LABEL[d]} {sortBy === scoreCol(d) ? '↓' : ''}
                  </th>
                ))}
                {group && <th>{group}</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i}>
                  <td className="text">{cell(r[res.text_column])}</td>
                  {DIMENSIONS.map((d) => (
                    <td key={d} className="num">{cell(r[scoreCol(d)])}</td>
                  ))}
                  {group && <td>{cell(r[group])}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {onSave && (
        <div className="card">
          <h2>Save results back to the database</h2>
          <p className="small muted">Creates a new table with every loaded column plus the scores. It will not overwrite an existing table.</p>
          <div className="row">
            <input type="text" value={table} onChange={(e) => setTable(e.target.value)} style={{ maxWidth: 260 }} />
            <button className="btn" onClick={save} disabled={!table}>Save as new table</button>
            {saveMsg && <span className="small">{saveMsg}</span>}
          </div>
        </div>
      )}
    </>
  )
}
