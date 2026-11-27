"""Behavior tests for v2: does the score move in the obvious direction?

Each row of behavior_tests.csv is a pair of sentences for one dimension where
"higher" should clearly score above "lower" (more fear, more stress, higher
morale, more trust). A pair passes when v2 agrees. Categories show *where* the
model breaks (e.g. negation, rumor vs. confirmed).

Usage (from the repo root):
    python evaluation/behavior_tests.py
"""

import argparse
import json
import os
import sys
from datetime import date

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "v2_NLU"))
from nlu import DEFAULT_MODEL, load_pipeline, score_texts  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tests", default=os.path.join(HERE, "behavior_tests.csv"))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--out-dir", default=os.path.join(HERE, "results"))
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    tests = pd.read_csv(args.tests)
    pipe = load_pipeline(args.model)

    for dim, group in tests.groupby("dimension"):
        texts = group["higher"].tolist() + group["lower"].tolist()
        scores = score_texts(pipe, texts, [dim], args.batch_size, verbose=False)[dim]
        n = len(group)
        tests.loc[group.index, "score_higher"] = scores[:n]
        tests.loc[group.index, "score_lower"] = scores[n:]

    tests["gap"] = (tests["score_higher"] - tests["score_lower"]).round(3)
    tests["passed"] = tests["gap"] > 0
    tests.to_csv(os.path.join(args.out_dir, "behavior_test_results.csv"), index=False)

    by_dim = tests.groupby("dimension")["passed"].agg(["sum", "count"])
    by_cat = tests.groupby("category")["passed"].agg(["sum", "count"])
    summary = {
        "model": args.model,
        "date": str(date.today()),
        "overall": {"passed": int(tests["passed"].sum()), "total": len(tests)},
        "by_dimension": {k: {"passed": int(r["sum"]), "total": int(r["count"])} for k, r in by_dim.iterrows()},
        "by_category": {k: {"passed": int(r["sum"]), "total": int(r["count"])} for k, r in by_cat.iterrows()},
        "failures": tests.loc[~tests["passed"], ["dimension", "category", "higher", "lower", "score_higher", "score_lower"]]
        .to_dict(orient="records"),
    }
    with open(os.path.join(args.out_dir, "behavior_tests_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\nPassed {summary['overall']['passed']} / {summary['overall']['total']} pairs")
    for k, r in summary["by_dimension"].items():
        print(f"  {k:7s} {r['passed']}/{r['total']}")
    print("\nBy category:")
    for k, r in summary["by_category"].items():
        print(f"  {k:22s} {r['passed']}/{r['total']}")
    if summary["failures"]:
        print("\nFailures:")
        for f in summary["failures"]:
            print(f"  [{f['dimension']}/{f['category']}] {f['score_higher']:+.2f} vs {f['score_lower']:+.2f}")
            print(f"     should be higher: {f['higher']}")
            print(f"     should be lower:  {f['lower']}")
    print(f"\nSaved results to {args.out_dir}")


if __name__ == "__main__":
    main()
