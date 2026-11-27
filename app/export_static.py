"""Export results as static JSON for the public, view-only website.

The public site has no Python backend: it reads these files instead.
Re-run this after updating the evaluation or the MILDEC v2 results:

    python app/export_static.py
    cd app/frontend && npm run build:public     # -> app/frontend/dist/

Writes:
    app/frontend/public/data/evaluation.json      (accuracy results)
    app/frontend/public/data/mildec_results.json  (v2 scores for the MILDEC posts)
"""

import json
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(HERE, "frontend", "public", "data")
sys.path.insert(0, ROOT)

from app.backend.main import _records, evaluation  # noqa: E402

DIMENSIONS = ["fear", "stress", "morale", "trust"]
MILDEC = os.path.join(ROOT, "data", "MILDEC_short_out_nlu.csv")
KEEP = ["text", "tick", "agentId", "timestamp"]


def write(name, data):
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) // 1024} KB)")


def main():
    os.makedirs(OUT, exist_ok=True)
    write("evaluation.json", evaluation())

    df = pd.read_csv(MILDEC)
    score_columns = [f"val_{d}" for d in DIMENSIONS]
    df = df[[c for c in KEEP if c in df.columns] + score_columns]
    write(
        "mildec_results.json",
        {
            "model": "v2",
            "text_column": "text",
            "score_columns": score_columns,
            "columns": list(df.columns),
            "rows": _records(df),
        },
    )


if __name__ == "__main__":
    main()
