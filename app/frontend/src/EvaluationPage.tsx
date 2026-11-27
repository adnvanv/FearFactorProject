import { useEffect, useMemo, useState } from 'react'
import { api, DIM_LABEL, PUBLIC, type Evaluation } from './api'
import { MirroredHistogram } from './charts'

const HIGH_LOW: Record<string, [string, string]> = {
  fear: ['Fearful (human-labeled)', 'Not fearful'],
  stress: ['Stressed (human-labeled)', 'Not stressed'],
  morale: ['Optimistic (human-labeled)', 'Sad'],
}

function Status({ pass }: { pass: boolean }) {
  return pass ? (
    <span className="status pass"><span aria-hidden>✓</span>Pass</span>
  ) : (
    <span className="status fail"><span aria-hidden>✕</span>Fail</span>
  )
}

const signed = (v: number) => (v > 0 ? '+' : '') + v.toFixed(2)

export default function EvaluationPage() {
  const [data, setData] = useState<Evaluation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [onlyFailures, setOnlyFailures] = useState(false)

  useEffect(() => {
    api.evaluation().then(setData, (e) => setError(String(e.message ?? e)))
  }, [])

  const behavior = useMemo(() => data?.behavior ?? [], [data])
  const byDim = useMemo(() => {
    const out: Record<string, { passed: number; total: number }> = {}
    for (const r of behavior) {
      out[r.dimension] ??= { passed: 0, total: 0 }
      out[r.dimension].total++
      if (r.passed) out[r.dimension].passed++
    }
    return out
  }, [behavior])

  if (error)
    return (
      <div className="error">
        Could not load results: {error}.{PUBLIC ? '' : ' Is the API running on port 8000?'}
      </div>
    )
  if (!data) return <p className="muted">Loading results…</p>

  const passed = behavior.filter((r) => r.passed).length
  const rows = onlyFailures ? behavior.filter((r) => !r.passed) : behavior

  return (
    <>
      <div className="stack">
        <h1>How accurate is v2?</h1>
        <p className="lede">
          v2 (<code>{data.model}</code>) was checked two ways without hand-labeling anything: against public datasets
          that other researchers paid people to label, and against obvious sentence pairs written for this scenario.
        </p>
      </div>

      <div className="grid-4">
        {data.public.map((p) => (
          <div className="tile" key={p.dimension}>
            <div className="label">{DIM_LABEL[p.dimension]} · AUC on human labels</div>
            <div className="value">{p.available ? p.auc?.toFixed(2) : '—'}</div>
            <div className="foot">{p.available ? '0.50 = coin flip · 1.00 = perfect' : 'Not run yet'}</div>
          </div>
        ))}
        <div className="tile">
          <div className="label">Behavior tests passed</div>
          <div className="value">{behavior.length ? `${passed}/${behavior.length}` : '—'}</div>
          <div className="foot">All four factors, incl. trust</div>
        </div>
      </div>

      <div className="card">
        <h2>What AUC means</h2>
        <p className="lede">
          Take one post people labeled as fearful and one they labeled as not fearful. AUC is how often v2 gives the
          fearful one the higher fear score. 0.79 means it gets the order right 79% of the time. It measures whether
          the <em>ranking</em> is right, which is what the simulation needs: more frightening posts should push agents
          further.
        </p>
      </div>

      <div className="grid-2">
        {data.public
          .filter((p) => p.available)
          .map((p) => (
            <div className="card" key={p.dimension}>
              <div className="card-head">
                <h2>{DIM_LABEL[p.dimension]}</h2>
                <span className="note">AUC {p.auc?.toFixed(2)}</span>
              </div>
              <p className="small muted">{p.dataset}</p>
              <MirroredHistogram
                high={p.high_scores!}
                low={p.low_scores!}
                highLabel={HIGH_LOW[p.dimension][0]}
                lowLabel={HIGH_LOW[p.dimension][1]}
                cutoff={p.best_cutoff}
              />
              <p className="small">
                Share of each group at each v2 score. If the cutoff is moved to <strong>{signed(p.best_cutoff!)}</strong>,
                v2 sorts <strong>{Math.round(p.balanced_accuracy_at_best_cutoff! * 100)}%</strong> correctly (balanced
                across both groups) vs. {Math.round(p.balanced_accuracy_at_zero! * 100)}% with a cutoff of 0.
              </p>
            </div>
          ))}
        <div className="card">
          <div className="card-head">
            <h2>Trust</h2>
            <span className="note">no public dataset</span>
          </div>
          <p className="small">
            No public dataset labels "trust in authorities", so trust is checked only by the behavior tests below:{' '}
            <strong>
              {byDim.trust ? `${byDim.trust.passed}/${byDim.trust.total}` : '—'}
            </strong>{' '}
            pairs passed.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Behavior tests</h2>
          <span className="note">
            Each pair has one sentence that should clearly score higher. Pass = v2 agrees.
          </span>
        </div>
        <div className="row small">
          {Object.entries(byDim).map(([dim, r]) => (
            <span key={dim} className="tile" style={{ padding: '6px 12px' }}>
              {DIM_LABEL[dim]}: <strong>{r.passed}/{r.total}</strong>
            </span>
          ))}
          <span style={{ marginLeft: 'auto' }} className="seg">
            <button aria-pressed={!onlyFailures} onClick={() => setOnlyFailures(false)}>All ({behavior.length})</button>
            <button aria-pressed={onlyFailures} onClick={() => setOnlyFailures(true)}>Failures ({behavior.length - passed})</button>
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Result</th>
                <th>Factor</th>
                <th>Tests</th>
                <th>Should score higher</th>
                <th className="num">Score</th>
                <th>Should score lower</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><Status pass={r.passed} /></td>
                  <td>{DIM_LABEL[r.dimension]}</td>
                  <td className="muted">{r.category}</td>
                  <td className="text">{r.higher}</td>
                  <td className="num">{signed(r.score_higher)}</td>
                  <td className="text">{r.lower}</td>
                  <td className="num">{signed(r.score_lower)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
