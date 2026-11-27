"""Emotion-based Fear / Stress / Morale / Trust (FSMT) scoring.

Runs an emotion classifier over a piece of text and maps the emotion
probabilities onto four levels (1 = low, 2 = medium, 3 = high).

Usage:
    python emotion_analyzer.py            # interactive prompt
    python emotion_analyzer.py "some text"

    from emotion_analyzer import EmotionAnalyzer
    analyzer = EmotionAnalyzer()
    analyzer.predict_levels("Drones are descending on the city!")
"""

import sys
from collections import defaultdict
from typing import Dict, List, Optional

from transformers import AutoTokenizer, pipeline

DEFAULT_MODEL = "j-hartmann/emotion-english-distilroberta-base"
LEVEL_COLUMNS = ["Fear Level", "Stress Level", "Morale Level", "Trust Level"]


def _resolve_device(device: Optional[int]) -> int:
    """Use the requested device, otherwise the first GPU if present, else CPU (-1)."""
    if device is not None:
        return device
    try:
        import torch

        return 0 if torch.cuda.is_available() else -1
    except ImportError:
        return -1


def emotions_to_levels(emotions: Dict[str, float]) -> Dict[str, int]:
    """Map emotion probabilities to Fear, Stress, Morale and Trust levels (1-3)."""
    fear = emotions.get("fear", 0.0)
    anger = emotions.get("anger", 0.0)
    neutral = emotions.get("neutral", 0.0)
    disgust = emotions.get("disgust", 0.0)
    sadness = emotions.get("sadness", 0.0)
    joy = emotions.get("joy", 0.0)

    negative = sadness + disgust + fear
    calm = joy + neutral

    if fear > (anger + neutral + disgust + sadness + joy) or fear > 0.8:
        fear_level = 3
    elif fear > 0.5 or fear > calm:
        fear_level = 2
    else:
        fear_level = 1

    if (sadness + anger) > calm or fear_level == 3:
        stress_level = 3
    elif (sadness + anger) > 0.5 or fear_level == 2:
        stress_level = 2
    else:
        stress_level = 1

    if negative < calm:
        morale_level = 3
    elif calm > 0.5:
        morale_level = 2
    else:
        morale_level = 1

    if negative < joy:
        trust_level = 3
    elif calm > negative:
        trust_level = 2
    else:
        trust_level = 1

    return dict(zip(LEVEL_COLUMNS, (fear_level, stress_level, morale_level, trust_level)))


class EmotionAnalyzer:
    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        device: Optional[int] = None,
        max_tokens: int = 400,
    ):
        """Load the emotion model.

        device: -1 for CPU, 0+ for a GPU index, None to auto-detect.
        max_tokens: texts longer than this are split into chunks and the
            scores are averaged, weighted by chunk length.
        """
        self.max_tokens = max_tokens
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.classifier = pipeline(
            "text-classification",
            model=model_name,
            tokenizer=self.tokenizer,
            top_k=None,
            device=_resolve_device(device),
        )

    def _chunk_text(self, text: str) -> List[str]:
        """Split text into pieces of at most max_tokens tokens."""
        tokens = self.tokenizer.encode(text, add_special_tokens=False)
        return [
            self.tokenizer.decode(tokens[i : i + self.max_tokens])
            for i in range(0, len(tokens), self.max_tokens)
        ]

    def get_raw_scores(self, text) -> Dict[str, float]:
        """Return emotion -> probability for the text (empty dict for blank input)."""
        text = _clean(text)
        if not text:
            return {}

        chunks = self._chunk_text(text)
        if len(chunks) <= 1:
            return {item["label"]: item["score"] for item in self.classifier(text, truncation=True)[0]}

        cumulative = defaultdict(float)
        total_chars = 0
        for chunk, result in zip(chunks, self.classifier(chunks, truncation=True)):
            total_chars += len(chunk)
            for item in result:
                cumulative[item["label"]] += item["score"] * len(chunk)

        return {label: score / total_chars for label, score in cumulative.items()}

    def predict_levels(self, text) -> Dict[str, int]:
        """Return {"Fear Level": 1-3, "Stress Level": ..., "Morale Level": ..., "Trust Level": ...}."""
        return emotions_to_levels(self.get_raw_scores(text))


def _clean(text) -> str:
    """Treat None / NaN / non-strings safely and strip whitespace."""
    if text is None or (isinstance(text, float) and text != text):
        return ""
    return str(text).strip()


def main():
    analyzer = EmotionAnalyzer()

    if len(sys.argv) > 1:
        print(analyzer.predict_levels(" ".join(sys.argv[1:])))
        return

    print("Analyzer ready. Enter text to analyze (or 'exit' to quit):")
    while True:
        try:
            user_input = input("> ")
        except (EOFError, KeyboardInterrupt):
            break
        if user_input.strip().lower() in {"exit", "quit"}:
            break
        if user_input.strip():
            print(analyzer.predict_levels(user_input))


if __name__ == "__main__":
    main()
