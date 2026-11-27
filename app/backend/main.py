"""FSMT Analyzer API.

Run from the repo root:
    uvicorn app.backend.main:app --port 8000
"""

import io
import math
import os
import threading
import time
import uuid

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import scoring, sources

ROOT = scoring.ROOT
RESULTS_DIR = os.path.join(ROOT, "evaluation", "results")

app = FastAPI(title="FSMT Analyzer")

DATASETS: dict[str, dict] = {}
JOBS: dict[str, dict] = {}


def _clean(value):
    """Make pandas values JSON-safe."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def _records(df: pd.DataFrame):
    return [{k: _clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def _bad(e: Exception):
    raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------- info


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/models")
def models():
    return scoring.model_info()


# ---------------------------------------------------------------- evaluation


def _auc(high, low):
    if not high or not low:
        return None
    wins = sum((h > l) + 0.5 * (h == l) for h in high for l in low)
    return wins / (len(high) * len(low))


PUBLIC = {
    "fear": "GoEmotions: Reddit comments rated fear/nervousness vs. neither (Google, human raters)",
    "stress": "Dreaddit: Reddit posts labeled stressed vs. not stressed (Columbia, human raters)",
    "morale": "TweetEval: tweets labeled optimism vs. sadness (SemEval-2018, human raters)",
}


@app.get("/api/evaluation")
def evaluation():
    public = []
    for dim, description in PUBLIC.items():
        path = os.path.join(RESULTS_DIR, f"public_{dim}_scores.csv")
        if not os.path.exists(path):
            public.append({"dimension": dim, "dataset": description, "available": False})
            continue
        df = pd.read_csv(path)
        high = df.loc[df["high"], "score"].tolist()
        low = df.loc[~df["high"], "score"].tolist()
        best_cut, best_bal = 0.0, 0.0
        for cut in [i / 100 for i in range(-100, 101, 2)]:
            tpr = sum(s > cut for s in high) / len(high)
            tnr = sum(s <= cut for s in low) / len(low)
            if (tpr + tnr) / 2 > best_bal:
                best_cut, best_bal = cut, (tpr + tnr) / 2
        public.append(
            {
                "dimension": dim,
                "dataset": description,
                "available": True,
                "auc": round(_auc(high, low), 3),
                "balanced_accuracy_at_zero": round(
                    (sum(s > 0 for s in high) / len(high) + sum(s <= 0 for s in low) / len(low)) / 2, 3
                ),
                "best_cutoff": best_cut,
                "balanced_accuracy_at_best_cutoff": round(best_bal, 3),
                "high_scores": high,
                "low_scores": low,
                "examples": _records(df.sample(min(12, len(df)), random_state=1)[["text", "high", "score"]]),
            }
        )

    behavior = None
    path = os.path.join(RESULTS_DIR, "behavior_test_results.csv")
    if os.path.exists(path):
        behavior = _records(pd.read_csv(path))

    return {"model": "facebook/bart-large-mnli", "public": public, "behavior": behavior}


# ---------------------------------------------------------------- data sources


class SqlConnection(BaseModel):
    url: str


class SqlQuery(BaseModel):
    url: str
    query: str


def _store(df: pd.DataFrame, origin: str):
    dataset_id = uuid.uuid4().hex[:12]
    DATASETS[dataset_id] = {"df": df, "origin": origin}
    text_guess = next((c for c in df.columns if c.lower() in ("text", "content", "body", "message", "post")), None)
    if text_guess is None:
        obj = [c for c in df.columns if df[c].dtype == object]
        text_guess = max(obj, key=lambda c: df[c].astype(str).str.len().mean()) if obj else None
    return {
        "dataset_id": dataset_id,
        "origin": origin,
        "rows": len(df),
        "columns": list(df.columns),
        "text_column_guess": text_guess,
        "preview": _records(df.head(20)),
    }


@app.post("/api/sql/tables")
def sql_tables(body: SqlConnection):
    try:
        return {"tables": sources.list_tables(body.url)}
    except sources.SourceError as e:
        _bad(e)


@app.post("/api/sql/load")
def sql_load(body: SqlQuery):
    try:
        df = sources.run_query(body.url, body.query)
    except sources.SourceError as e:
        _bad(e)
    return _store(df, "sql")


@app.post("/api/csv/load")
async def csv_load(file: UploadFile = File(...)):
    try:
        df = sources.read_csv_bytes(await file.read())
    except sources.SourceError as e:
        _bad(e)
    return _store(df, f"csv:{file.filename}")


# ---------------------------------------------------------------- jobs


class JobRequest(BaseModel):
    dataset_id: str
    text_column: str
    model: str = "v2"


def _run_job(job_id: str):
    job = JOBS[job_id]
    df = DATASETS[job["dataset_id"]]["df"]
    started = time.time()

    def progress(done, total):
        job["done"], job["total"] = done, total
        elapsed = time.time() - started
        job["eta_seconds"] = round(elapsed / done * (total - done)) if done else None

    try:
        job["status"] = "loading model"
        texts = df[job["text_column"]].tolist()
        job["status"] = "running"
        scores = scoring.score(job["model"], texts, progress)
        result = df.copy()
        prefix = "val_" if job["model"] == "v2" else "v1_"
        for d in scoring.DIMENSIONS:
            result[f"{prefix}{d}"] = scores[d]
            if job["model"] == "v2":
                result[f"level_{d}"] = pd.array(scores[f"level_{d}"], dtype="Int64")
        job["result"] = result
        job["score_columns"] = [f"{prefix}{d}" for d in scoring.DIMENSIONS]
        job["status"] = "done"
    except Exception as e:  # surface model errors to the UI
        job["status"] = "error"
        job["error"] = str(e)
    job["seconds"] = round(time.time() - started, 1)


@app.post("/api/jobs")
def create_job(body: JobRequest):
    if body.dataset_id not in DATASETS:
        _bad("Dataset not found. Load the data again.")
    if body.text_column not in DATASETS[body.dataset_id]["df"].columns:
        _bad(f"Column '{body.text_column}' not found.")
    if body.model not in ("v1", "v2"):
        _bad("Model must be v1 or v2.")
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {
        "id": job_id,
        "dataset_id": body.dataset_id,
        "text_column": body.text_column,
        "model": body.model,
        "status": "queued",
        "done": 0,
        "total": None,
        "eta_seconds": None,
        "error": None,
    }
    threading.Thread(target=_run_job, args=(job_id,), daemon=True).start()
    return {"job_id": job_id}


def _job(job_id):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    job = _job(job_id)
    return {k: v for k, v in job.items() if k != "result"}


@app.get("/api/jobs/{job_id}/results")
def job_results(job_id: str, group: str | None = None):
    job = _job(job_id)
    if job["status"] != "done":
        _bad("Job is not finished.")
    df = job["result"]
    cols = [job["text_column"]] + job["score_columns"]
    if group and group in df.columns and group not in cols:
        cols.append(group)
    return {
        "model": job["model"],
        "text_column": job["text_column"],
        "score_columns": job["score_columns"],
        "columns": list(df.columns),
        "rows": _records(df[cols]),
    }


@app.get("/api/jobs/{job_id}/csv")
def job_csv(job_id: str):
    job = _job(job_id)
    if job["status"] != "done":
        _bad("Job is not finished.")
    buf = io.StringIO()
    job["result"].to_csv(buf, index=False)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="fsmt_{job["model"]}_{job_id}.csv"'},
    )


class SaveRequest(BaseModel):
    url: str
    table: str


@app.post("/api/jobs/{job_id}/save")
def job_save(job_id: str, body: SaveRequest):
    job = _job(job_id)
    if job["status"] != "done":
        _bad("Job is not finished.")
    try:
        sources.write_table(body.url, body.table, job["result"])
    except sources.SourceError as e:
        _bad(e)
    return {"ok": True, "table": body.table, "rows": len(job["result"])}
