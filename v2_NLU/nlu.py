"""v2: zero-shot NLI scoring of Fear / Stress / Morale / Trust.

For each dimension the text is classified against three labels (low, medium,
high) with an NLI model. The score is P(high) - P(low), giving a value in
[-1, 1] where higher means MORE of that dimension (more fear, more stress,
higher morale, more trust). Each score is also bucketed into a 1-3 level.

Output columns: val_fear, val_stress, val_morale, val_trust and
level_fear, level_stress, level_morale, level_trust.

Usage:
    python nlu.py data/MILDEC_short_out.csv --output results.csv
    python nlu.py input.csv --model ./code/bartLargeMnli   # use a local copy

A GPU is strongly recommended for the default (large) model.
"""

import argparse

import pandas as pd
import torch
from datasets import Dataset
from transformers import pipeline
from transformers.pipelines.pt_utils import KeyDataset

DEFAULT_MODEL = "facebook/bart-large-mnli"

# Labels are ordered low -> medium -> high for each dimension.
DIMENSIONS = {
    "fear": {
        "labels": ["safe and secure", "moderate tension", "extreme panic and terror"],
        "template": "From a US-allied perspective, the civilian fear level is {}.",
    },
    "stress": {
        "labels": ["calm and relaxed", "busy and alert", "overwhelmed and traumatized"],
        "template": "From a US-allied perspective, the speaker's stress level is {}.",
    },
    "morale": {
        "labels": ["defeated and hopeless", "indifferent", "hopeful and motivated"],
        "template": "From a US-allied perspective, the morale of the speaker is {}.",
    },
    "trust": {
        "labels": ["betrayed and suspicious of leadership", "skeptical", "loyal and confident in leadership"],
        "template": "From a US-allied perspective, the trust in US/NATO is {}.",
    },
}


def score_to_level(score: float, threshold: float = 1 / 3) -> int:
    """Bucket a [-1, 1] score into 1 (low), 2 (medium) or 3 (high)."""
    if score <= -threshold:
        return 1
    if score >= threshold:
        return 3
    return 2


def run_analysis(input_path, output_path, model=DEFAULT_MODEL, text_column="text", batch_size=32):
    print(f"Loading data from: {input_path}")
    df = pd.read_csv(input_path)
    if text_column not in df.columns:
        raise SystemExit(f"Error: column '{text_column}' not found. Columns: {list(df.columns)}")

    # Skip blank / missing rows; their scores stay empty in the output.
    texts = df[text_column].fillna("").astype(str).str.strip()
    mask = texts != ""
    dataset = Dataset.from_dict({"text": texts[mask].tolist()})
    print(f"Scoring {mask.sum()} of {len(df)} rows ({(~mask).sum()} blank).")

    device = 0 if torch.cuda.is_available() else -1
    if device == 0:
        print(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("No GPU found, running on CPU (this will be slow).")

    pipe = pipeline("zero-shot-classification", model=model, device=device)

    for dim_name, config in DIMENSIONS.items():
        print(f"Processing {dim_name.upper()}...")
        low, _, high = config["labels"]
        scores = []
        for out in pipe(
            KeyDataset(dataset, "text"),
            candidate_labels=config["labels"],
            hypothesis_template=config["template"],
            batch_size=batch_size,
            truncation=True,
        ):
            probs = dict(zip(out["labels"], out["scores"]))
            scores.append(round(probs[high] - probs[low], 3))

        df.loc[mask, f"val_{dim_name}"] = scores
        df[f"level_{dim_name}"] = df[f"val_{dim_name}"].map(
            lambda s: score_to_level(s) if pd.notna(s) else pd.NA
        ).astype("Int64")

    df.to_csv(output_path, index=False)
    print(f"Analysis complete. Results saved to: {output_path}")
    return df


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", help="Path to the input CSV file")
    parser.add_argument("--output", default="simulation_results.csv", help="Output CSV path")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="HF model id or local path (default: %(default)s)")
    parser.add_argument("--column", default="text", help="Column containing the text (default: %(default)s)")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size (lower it if you run out of memory)")
    args = parser.parse_args()

    run_analysis(args.input, args.output, args.model, args.column, args.batch_size)


if __name__ == "__main__":
    main()
