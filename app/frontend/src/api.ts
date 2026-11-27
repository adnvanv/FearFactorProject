export type Row = Record<string, string | number | boolean | null>

export interface PublicResult {
  dimension: string
  dataset: string
  available: boolean
  auc?: number
  balanced_accuracy_at_zero?: number
  best_cutoff?: number
  balanced_accuracy_at_best_cutoff?: number
  high_scores?: number[]
  low_scores?: number[]
  examples?: { text: string; high: boolean; score: number }[]
}

export interface BehaviorRow {
  dimension: string
  category: string
  higher: string
  lower: string
  score_higher: number
  score_lower: number
  gap: number
  passed: boolean
}

export interface Evaluation {
  model: string
  public: PublicResult[]
  behavior: BehaviorRow[] | null
}

export interface LoadedDataset {
  dataset_id: string
  origin: string
  rows: number
  columns: string[]
  text_column_guess: string | null
  preview: Row[]
}

export interface Job {
  id: string
  status: 'queued' | 'loading model' | 'running' | 'done' | 'error'
  model: 'v1' | 'v2'
  done: number
  total: number | null
  eta_seconds: number | null
  error: string | null
  seconds?: number
}

export interface JobResults {
  model: 'v1' | 'v2'
  text_column: string
  score_columns: string[]
  columns: string[]
  rows: Row[]
}

export interface ModelInfo {
  label: string
  model: string
  scale: string
}

/** Public, view-only build: reads exported JSON instead of calling the Python API. */
export const PUBLIC = import.meta.env.VITE_PUBLIC === '1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => undefined)
  if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`)
  // e.g. a web server answering with an HTML page instead of the data file
  if (body === undefined) throw new Error(`Unexpected response from ${path}`)
  return body as T
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  evaluation: () => request<Evaluation>(PUBLIC ? 'data/evaluation.json' : '/api/evaluation'),
  /** Precomputed v2 scores for the MILDEC posts (static file, works with or without the API). */
  mildecResults: () => request<JobResults>('data/mildec_results.json'),
}

/** Calls that need the Python API (Analyze page only; not used by the public build). */
export const analyzeApi = {
  models: () => request<Record<string, ModelInfo>>('/api/models'),
  sqlTables: (url: string) =>
    request<{ tables: { name: string; columns: string[] }[] }>('/api/sql/tables', json({ url })),
  sqlLoad: (url: string, query: string) => request<LoadedDataset>('/api/sql/load', json({ url, query })),
  csvLoad: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<LoadedDataset>('/api/csv/load', { method: 'POST', body: form })
  },
  startJob: (dataset_id: string, text_column: string, model: string) =>
    request<{ job_id: string }>('/api/jobs', json({ dataset_id, text_column, model })),
  job: (id: string) => request<Job>(`/api/jobs/${id}`),
  results: (id: string, group?: string) =>
    request<JobResults>(`/api/jobs/${id}/results${group ? `?group=${encodeURIComponent(group)}` : ''}`),
  csvUrl: (id: string) => `/api/jobs/${id}/csv`,
  saveToSql: (id: string, url: string, table: string) =>
    request<{ ok: boolean; table: string; rows: number }>(`/api/jobs/${id}/save`, json({ url, table })),
}

export const DIMENSIONS = ['fear', 'stress', 'morale', 'trust'] as const
export const DIM_LABEL: Record<string, string> = { fear: 'Fear', stress: 'Stress', morale: 'Morale', trust: 'Trust' }
export const DIM_COLOR: Record<string, string> = {
  fear: 'var(--series-1)',
  stress: 'var(--series-2)',
  morale: 'var(--series-3)',
  trust: 'var(--series-4)',
}
