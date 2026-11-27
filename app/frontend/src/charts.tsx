import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/* Plain-SVG charts. Each chart measures its container so the viewBox is in real
   pixels (text stays at its true size); tooltips are positioned as % of it. */

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(560)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    const ro = new ResizeObserver((entries) => setW(Math.max(280, Math.round(entries[0].contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Bar path with 4px rounded corners on the data end only (anchored to the baseline). */
function bar(x: number, base: number, w: number, h: number, up: boolean) {
  if (h <= 0 || w <= 0) return ''
  const r = Math.min(4, w / 2, h)
  if (up) {
    const top = base - h
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
  }
  const bottom = base + h
  return `M${x},${base}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${base}Z`
}

function Tooltip({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children: ReactNode }) {
  return (
    <div className="tooltip" style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }}>
      {children}
    </div>
  )
}

function TTRow({ color, value, label }: { color: string; value: ReactNode; label: string }) {
  return (
    <div className="tt-row">
      <span className="tt-key" style={{ background: color }} />
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  )
}

function binCounts(values: number[], lo: number, hi: number, bins: number) {
  const counts = new Array(bins).fill(0)
  for (const v of values) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))
    counts[i]++
  }
  return counts
}

const fmt = (v: number, d = 2) => (v > 0 ? '+' : '') + v.toFixed(d)

/** Two distributions on one axis: "high" grows up, "low" grows down. */
export function MirroredHistogram({
  high,
  low,
  highLabel,
  lowLabel,
  cutoff,
  bins = 20,
}: {
  high: number[]
  low: number[]
  highLabel: string
  lowLabel: string
  cutoff?: number
  bins?: number
}) {
  const [box, W] = useWidth()
  const H = 262
  const m = { l: 34, r: 12, t: 24, b: 26 }
  const iw = W - m.l - m.r
  const half = (H - m.t - m.b) / 2
  const base = m.t + half
  const hc = binCounts(high, -1, 1, bins)
  const lc = binCounts(low, -1, 1, bins)
  // Share of each group, so groups of different size are comparable.
  const hp = hc.map((c) => c / high.length)
  const lp = lc.map((c) => c / low.length)
  const max = Math.max(...hp, ...lp, 0.01)
  const bw = iw / bins
  const xOf = (v: number) => m.l + ((v + 1) / 2) * iw
  const [hover, setHover] = useState<number | null>(null)
  const ticks = [-1, -0.5, 0, 0.5, 1]
  const pct = (p: number) => `${Math.round(p * 100)}%`

  return (
    <div className="stack">
      <div className="legend">
        <span className="key"><span className="swatch" style={{ background: 'var(--series-1)' }} />{highLabel} ({high.length})</span>
        <span className="key"><span className="swatch" style={{ background: 'var(--series-2)' }} />{lowLabel} ({low.length})</span>
      </div>
      <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Distribution of v2 scores: ${highLabel} vs ${lowLabel}`}>
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line className="gridline" x1={m.l} x2={W - m.r} y1={base - f * half} y2={base - f * half} />
              <line className="gridline" x1={m.l} x2={W - m.r} y1={base + f * half} y2={base + f * half} />
              <text x={m.l - 6} y={base - f * half + 4} textAnchor="end">{pct(max * f)}</text>
              <text x={m.l - 6} y={base + f * half + 4} textAnchor="end">{pct(max * f)}</text>
            </g>
          ))}
          {hover !== null && <rect className="hover-band" x={m.l + hover * bw} y={m.t} width={bw} height={half * 2} />}
          {hp.map((p, i) => (
            <path key={`h${i}`} d={bar(m.l + i * bw + 1, base - 1, bw - 2, (p / max) * half - 1, true)} fill="var(--series-1)" />
          ))}
          {lp.map((p, i) => (
            <path key={`l${i}`} d={bar(m.l + i * bw + 1, base + 1, bw - 2, (p / max) * half - 1, false)} fill="var(--series-2)" />
          ))}
          <line className="baseline" x1={m.l} x2={W - m.r} y1={base} y2={base} />
          {cutoff !== undefined && (
            <g>
              <line x1={xOf(cutoff)} x2={xOf(cutoff)} y1={m.t} y2={H - m.b} stroke="var(--ink-2)" strokeDasharray="3 3" />
              <text x={xOf(cutoff)} y={m.t - 8} textAnchor="middle" className="direct">best cutoff {fmt(cutoff)}</text>
            </g>
          )}
          {ticks.map((t) => (
            <text key={t} x={xOf(t)} y={H - 8} textAnchor="middle">{t === 0 ? '0' : fmt(t, 1)}</text>
          ))}
          {hc.map((_, i) => (
            <rect
              key={`hit${i}`}
              className="hit"
              x={m.l + i * bw}
              y={m.t}
              width={bw}
              height={half * 2}
              onPointerEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hover !== null && (
          <Tooltip w={W} x={m.l + (hover + 0.5) * bw} y={m.t + 10} h={H}>
            <div className="tt-head">Score {fmt(-1 + (hover * 2) / bins)} to {fmt(-1 + ((hover + 1) * 2) / bins)}</div>
            <TTRow color="var(--series-1)" value={`${hc[hover]} (${pct(hp[hover])})`} label={highLabel} />
            <TTRow color="var(--series-2)" value={`${lc[hover]} (${pct(lp[hover])})`} label={lowLabel} />
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/** One distribution. Continuous values are binned over [lo, hi]; discrete levels get one bar each. */
export function Histogram({
  values,
  color,
  title,
  discrete,
}: {
  values: number[]
  color: string
  title: string
  discrete?: number[]
}) {
  const [box, W] = useWidth()
  const H = 190
  const m = { l: 30, r: 8, t: 26, b: 24 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const counts = discrete
    ? discrete.map((d) => values.filter((v) => v === d).length)
    : binCounts(values, -1, 1, 20)
  const labels = discrete ? discrete.map(String) : null
  const n = counts.length
  const max = Math.max(...counts, 1)
  const bw = iw / n
  const [hover, setHover] = useState<number | null>(null)
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0

  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} distribution`}>
        <text className="title" x={0} y={14}>{title}</text>
        <text x={W - m.r} y={14} textAnchor="end">mean {discrete ? mean.toFixed(2) : fmt(mean)} · n={values.length}</text>
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line className="gridline" x1={m.l} x2={W - m.r} y1={m.t + ih - f * ih} y2={m.t + ih - f * ih} />
            <text x={m.l - 6} y={m.t + ih - f * ih + 4} textAnchor="end">{Math.round(max * f)}</text>
          </g>
        ))}
        {hover !== null && <rect className="hover-band" x={m.l + hover * bw} y={m.t} width={bw} height={ih} />}
        {counts.map((c, i) => (
          <path key={i} d={bar(m.l + i * bw + 1, m.t + ih, bw - 2, (c / max) * ih, true)} fill={color} />
        ))}
        <line className="baseline" x1={m.l} x2={W - m.r} y1={m.t + ih} y2={m.t + ih} />
        {labels
          ? labels.map((l, i) => (
              <text key={l} x={m.l + (i + 0.5) * bw} y={H - 7} textAnchor="middle">{l}</text>
            ))
          : [-1, -0.5, 0, 0.5, 1].map((t) => (
              <text key={t} x={m.l + ((t + 1) / 2) * iw} y={H - 7} textAnchor="middle">{t === 0 ? '0' : fmt(t, 1)}</text>
            ))}
        {counts.map((_, i) => (
          <rect key={`hit${i}`} className="hit" x={m.l + i * bw} y={m.t} width={bw} height={ih} onPointerEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <Tooltip w={W} x={m.l + (hover + 0.5) * bw} y={m.t + ih * (1 - counts[hover] / max)} h={H}>
          <div className="tt-head">
            {labels ? `Level ${labels[hover]}` : `Score ${fmt(-1 + (hover * 2) / n)} to ${fmt(-1 + ((hover + 1) * 2) / n)}`}
          </div>
          <TTRow color={color} value={counts[hover]} label="posts" />
        </Tooltip>
      )}
    </div>
  )
}

export interface LineSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
}

/** Lines over an ordered x (e.g. simulation tick), with a crosshair tooltip and direct end labels. */
export function LineChart({
  xs,
  series,
  xLabel,
  yDomain,
  signed = true,
}: {
  xs: string[]
  series: LineSeries[]
  xLabel: string
  yDomain: [number, number]
  signed?: boolean
}) {
  const [box, W] = useWidth()
  const fmtV = (v: number) => (signed ? fmt(v) : v.toFixed(2))
  const H = 300
  const m = { l: 40, r: 70, t: 14, b: 34 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const [lo, hi] = yDomain
  const xOf = (i: number) => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw)
  const yOf = (v: number) => m.t + ih - ((v - lo) / (hi - lo)) * ih
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const yTicks = [lo, (lo + hi) / 2, hi]
  const xStep = Math.max(1, Math.ceil(xs.length / 8))

  function onMove(e: React.PointerEvent) {
    const svg = ref.current
    if (!svg || !xs.length) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const i = xs.length === 1 ? 0 : Math.round(((x - m.l) / iw) * (xs.length - 1))
    setHover(Math.max(0, Math.min(xs.length - 1, i)))
  }

  // Direct labels at the last point, nudged apart so they don't collide.
  const ends = series
    .map((s) => {
      let i = s.values.length - 1
      while (i >= 0 && s.values[i] === null) i--
      return { s, y: i >= 0 ? yOf(s.values[i] as number) : null }
    })
    .filter((e) => e.y !== null)
    .sort((a, b) => (a.y as number) - (b.y as number))
  for (let i = 1; i < ends.length; i++) {
    if ((ends[i].y as number) - (ends[i - 1].y as number) < 14) ends[i].y = (ends[i - 1].y as number) + 14
  }

  return (
    <div className="stack">
      <div className="legend">
        {series.map((s) => (
          <span className="key" key={s.key}><span className="line" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} role="img" aria-label={`Average scores by ${xLabel}`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'gridline'} x1={m.l} x2={W - m.r} y1={yOf(t)} y2={yOf(t)} />
              <text x={m.l - 6} y={yOf(t) + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          ))}
          {xs.map((x, i) =>
            i % xStep === 0 ? <text key={x} x={xOf(i)} y={H - 16} textAnchor="middle">{x}</text> : null,
          )}
          <text x={m.l + iw / 2} y={H - 1} textAnchor="middle">{xLabel}</text>
          {hover !== null && <line x1={xOf(hover)} x2={xOf(hover)} y1={m.t} y2={m.t + ih} stroke="var(--ink-2)" strokeWidth={1} />}
          {series.map((s) => {
            let d = ''
            let pen = false
            s.values.forEach((v, i) => {
              if (v === null) return void (pen = false)
              d += `${pen ? 'L' : 'M'}${xOf(i)},${yOf(v)}`
              pen = true
            })
            return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          })}
          {hover !== null &&
            series.map((s) =>
              s.values[hover] === null ? null : (
                <circle key={s.key} cx={xOf(hover)} cy={yOf(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ),
            )}
          {ends.map(({ s, y }) => (
            <text key={s.key} className="direct" x={W - m.r + 6} y={(y as number) + 4}>{s.label}</text>
          ))}
          <rect className="hit" x={m.l} y={m.t} width={iw} height={ih} />
        </svg>
        {hover !== null && (
          <Tooltip w={W} x={xOf(hover)} y={m.t + 8} h={H}>
            <div className="tt-head">{xLabel} {xs[hover]}</div>
            {series.map((s) => (
              <TTRow key={s.key} color={s.color} value={s.values[hover] === null ? '–' : fmtV(s.values[hover] as number)} label={s.label} />
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  )
}
