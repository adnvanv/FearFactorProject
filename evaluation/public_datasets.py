"""Measure v2 against public datasets that were labeled by humans.

    fear    GoEmotions (Google, Reddit comments). High = rated "fear" or
            "nervousness"; low = comments with neither.
    stress  Dreaddit (Columbia, Reddit posts). High = labeled stressed.
    morale  TweetEval emotion (SemEval-2018 tweets). High = "optimism";
            low = "sadness". Optimism vs sadness is a stand-in for morale.
    trust   No suitable public dataset; covered by behavior_tests.py instead.

For each dataset we take an equal number of high and low examples and report:
    AUC       If you pick one "high" and one "low" text at random, how often
              does v2 give the high one the higher score? 0.5 = coin flip,
              1.0 = perfect.
    accuracy  % of texts on the correct side of zero (score > 0 means high).

Usage (from the repo root):
    python evaluation/public_datasets.py                 # 200 high + 200 low each
    python evaluation/public_datasets.py --per-class 50  # quicker run
"""

import argparse
import json
import os
import sys
from datetime import date

import pandas as pd
from datasets import load_dataset

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "v2_NLU"))
from nlu import DEFAULT_MODEL, load_pipeline, score_texts  # noqa: E402

SEED = 42


def load_fear():
    ds = load_dataset("google-research-datasets/go_emotions", "simplified", split="test")
    names = ds.features["labels"].feature.names
    fearful = {names.index("fear"), names.index("nervousness")}
    df = ds.to_pandas()
    df["high"] = df["labels"].map(lambda labels: bool(fearful & set(labels)))
    return df[["text", "high"]]


def load_stress():
    df = load_dataset("andreagasparini/dreaddit", split="test").to_pandas()
    df["high"] = df["label"] == 1
    return df[["text", "high"]]


def load_morale():
    ds = load_dataset("cardiffnlp/tweet_eval", "emotion", split="test")
    names = ds.features["label"].names
    df = ds.to_pandas()
    df["name"] = df["label"].map(lambda i: names[i])
    df = df[df["name"].isin(["optimism", "sadness"])]
    df["high"] = df["name"] == "optimism"
    return df[["text", "high"]]


DATASETS = {
    "fear": ("GoEmotions (fear/nervousness vs. neither)", load_fear),
    "stress": ("Dreaddit (stressed vs. not stressed)", load_stress),
    "morale": ("TweetEval emotion (optimism vs. sadness)", load_morale),
}


def balanced_sample(df, per_class):
    parts = []
    for value in (True, False):
        group = df[df["high"] == value]
        parts.append(group.sample(min(per_class, len(group)), random_state=SEED))
    return pd.concat(parts).reset_index(drop=True)


def auc(scores, labels):
    """Probability a random high example outscores a random low one (ties count half)."""
    high = [s for s, y in zip(scores, labels) if y]
    low = [s for s, y in zip(scores, labels) if not y]
    wins = sum((h > l) + 0.5 * (h == l) for h in high for l in low)
    return wins / (len(high) * len(low))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--per-class", type=int, default=200, help="Examples per class (default: %(default)s)")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--out-dir", default=os.path.join(HERE, "results"))
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    pipe = load_pipeline(args.model)
    summary = {"model": args.model, "date": str(date.today()), "per_class": args.per_class, "results": {}}

    for dim, (description, loader) in DATASETS.items():
        print(f"\n== {dim}: {description}")
        sample = balanced_sample(loader(), args.per_class)
        scores = score_texts(pipe, sample["text"].tolist(), [dim], args.batch_size, verbose=False)[dim]
        sample["score"] = scores
        labels = sample["high"].tolist()

        result = {
            "dataset": description,
            "n_high": int(sample["high"].sum()),
            "n_low": int((~sample["high"]).sum()),
            "auc": round(auc(scores, labels), 3),
            "accuracy": round(sum((s > 0) == y for s, y in zip(scores, labels)) / len(labels), 3),
            "mean_score_high": round(sample.loc[sample["high"], "score"].mean(), 3),
            "mean_score_low": round(sample.loc[~sample["high"], "score"].mean(), 3),
        }
        summary["results"][dim] = result
        sample.to_csv(os.path.join(args.out_dir, f"public_{dim}_scores.csv"), index=False)
        print(json.dumps(result, indent=2))

    with open(os.path.join(args.out_dir, "public_datasets_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSaved results to {args.out_dir}")


if __name__ == "__main__":
    main()
