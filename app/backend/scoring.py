"""Thin wrappers that run v1 / v2 on a list of texts with progress callbacks.

Models are loaded once and cached. Set FSMT_V2_MODEL to use a different
(e.g. smaller or local) zero-shot model for v2.
"""

import os
import sys
import threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "v2_NLU"))
sys.path.insert(0, os.path.join(ROOT, "stable-v1"))

DIMENSIONS = ["fear", "stress", "morale", "trust"]
V1_COLUMNS = {"fear": "Fear Level", "stress": "Stress Level", "morale": "Morale Level", "trust": "Trust Level"}

_lock = threading.Lock()
_models = {}


def _get(name):
    with _lock:
        if name not in _models:
            if name == "v2":
                import nlu

                _models[name] = nlu.load_pipeline(os.environ.get("FSMT_V2_MODEL", nlu.DEFAULT_MODEL))
            elif name == "v1":
                from emotion_analyzer import EmotionAnalyzer

                _models[name] = EmotionAnalyzer()
            else:
                raise ValueError(f"Unknown model '{name}'")
        return _models[name]


def model_info():
    import nlu

    return {
        "v2": {
            "label": "v2: zero-shot NLU (accurate, slower)",
            "model": os.environ.get("FSMT_V2_MODEL", nlu.DEFAULT_MODEL),
            "scale": "-1 to 1 (higher = more of that factor), plus 1-3 levels",
        },
        "v1": {
            "label": "v1: emotion classifier (fast, rough)",
            "model": "j-hartmann/emotion-english-distilroberta-base",
            "scale": "1-3 levels",
        },
    }


def score(model, texts, on_progress, chunk_size=16):
    """Return {dimension: [value, ...]} for each text. Blank texts get None."""
    # None / NaN (empty cells from pandas or SQL NULL) count as blank.
    clean = ["" if t is None or (isinstance(t, float) and t != t) else str(t).strip() for t in texts]
    keep = [i for i, t in enumerate(clean) if t]
    out = {d: [None] * len(texts) for d in DIMENSIONS}
    if model == "v2":
        out.update({f"level_{d}": [None] * len(texts) for d in DIMENSIONS})
    done = 0
    on_progress(0, len(keep))

    if model == "v2":
        import nlu

        pipe = _get("v2")
        for start in range(0, len(keep), chunk_size):
            idx = keep[start : start + chunk_size]
            scores = nlu.score_texts(pipe, [clean[i] for i in idx], DIMENSIONS, batch_size=chunk_size, verbose=False)
            for d in DIMENSIONS:
                for i, s in zip(idx, scores[d]):
                    out[d][i] = s
                    out[f"level_{d}"][i] = nlu.score_to_level(s)
            done += len(idx)
            on_progress(done, len(keep))
    elif model == "v1":
        analyzer = _get("v1")
        for i in keep:
            levels = analyzer.predict_levels(clean[i])
            for d in DIMENSIONS:
                out[d][i] = levels[V1_COLUMNS[d]]
            done += 1
            if done % 10 == 0 or done == len(keep):
                on_progress(done, len(keep))
    else:
        raise ValueError(f"Unknown model '{model}'")
    return out
