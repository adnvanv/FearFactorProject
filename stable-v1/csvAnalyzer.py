"""Score every row of a CSV with the v1 emotion-based FSMT analyzer.

Adds "Fear Level", "Stress Level", "Morale Level" and "Trust Level" columns.

Usage:
    python csvAnalyzer.py data/MILDEC_short_out.csv
    python csvAnalyzer.py data/MILDEC_short_out.csv --column text --output out.csv
    python csvAnalyzer.py          # prompts for the file and column
"""

import argparse
import os
import sys

import pandas as pd

from emotion_analyzer import LEVEL_COLUMNS, EmotionAnalyzer


def default_output_path(input_path: str) -> str:
    root, ext = os.path.splitext(input_path)
    return f"{root}_analyzed{ext or '.csv'}"


def analyze_csv(input_path: str, column: str = "text", output_path: str = None) -> pd.DataFrame:
    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} rows from {input_path}.")

    if column not in df.columns:
        raise SystemExit(f"Error: column '{column}' not found. Columns: {list(df.columns)}")

    analyzer = EmotionAnalyzer()
    print("Analyzing text... (this may take a moment)")

    levels = pd.DataFrame(
        [analyzer.predict_levels(text) for text in df[column]],
        index=df.index,
        columns=LEVEL_COLUMNS,
    )
    # Replace any level columns left over from a previous run.
    df = pd.concat([df.drop(columns=LEVEL_COLUMNS, errors="ignore"), levels], axis=1)

    output_path = output_path or default_output_path(input_path)
    df.to_csv(output_path, index=False)

    print("-" * 30)
    print(f"Saved results to: {output_path}")
    print(df[LEVEL_COLUMNS].head())
    return df


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", nargs="?", help="Path to the input CSV file")
    parser.add_argument("--column", default=None, help="Column containing the text (default: text)")
    parser.add_argument("--output", default=None, help="Output CSV path (default: <input>_analyzed.csv)")
    args = parser.parse_args()

    input_path = args.input or input("Enter the path to your CSV file: ").strip()
    if not os.path.exists(input_path):
        sys.exit(f"Error: file '{input_path}' not found.")

    column = args.column
    if column is None:
        column = "text" if args.input else (input("Text column name [text]: ").strip() or "text")

    analyze_csv(input_path, column, args.output)


if __name__ == "__main__":
    main()
