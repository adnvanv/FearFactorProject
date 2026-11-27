# Stable v1: Emotion-based FSMT analyzer
This explains how to use [emotion_analyzer.py](./emotion_analyzer.py) and [csvAnalyzer.py](./csvAnalyzer.py).

## Requirements
Python 3.10+ is recommended. From the repo root run: `pip install -r requirements.txt`
(or just `pip install torch transformers pandas` for v1).

The model weights (`j-hartmann/emotion-english-distilroberta-base`) are downloaded the first time it runs.
A GPU is used automatically if one is available; otherwise it runs on the CPU.

## Analyzing text
```
python emotion_analyzer.py "There is a massive food shortage and Donovia is moving in and killing innocents, the city must be evacuated."
# {'Fear Level': 2, 'Stress Level': 3, 'Morale Level': 1, 'Trust Level': 1}
```
Run it with no arguments to get an interactive prompt (type `exit` to quit).

## Analyzing a CSV
```
python csvAnalyzer.py ../data/MILDEC_short_out.csv --column text
```
- `--column` defaults to `text`.
- `--output` defaults to `<input>_analyzed.csv`.
- Run it with no arguments to be prompted for the file and column.

```
Loaded 1713 rows from ../data/MILDEC_short_out.csv.
Analyzing text... (this may take a moment)
------------------------------
Saved results to: ../data/MILDEC_short_out_analyzed.csv
   Fear Level  Stress Level  Morale Level  Trust Level
0           2             3             1            1
1           3             3             1            1
...
```

## Using it from Python
```python
from emotion_analyzer import EmotionAnalyzer

analyzer = EmotionAnalyzer()            # optional: model_name=..., device=-1 (CPU) / 0 (GPU)
analyzer.predict_levels("There is a massive food shortage and Donovia is moving in and killing innocents, the city must be evacuated.")
# {'Fear Level': 2, 'Stress Level': 3, 'Morale Level': 1, 'Trust Level': 1}

analyzer.get_raw_scores("...")          # the underlying emotion probabilities
```

Long texts are split into 400-token chunks and the emotion scores are averaged, weighted by chunk length.
Blank or missing text scores 1 on every level.
