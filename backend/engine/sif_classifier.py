"""
SIF (Serious Injury or Fatality) Potential Classifier.

Implements a two-stage classification approach:
  Stage 1: Keyword-based scoring using DEKRA/EEI SIF precursor taxonomy
  Stage 2: TF-IDF + Logistic Regression trained on seed data
  Fusion: Weighted combination → final SIF score (0-100)

Designed for weak supervision — works with no labeled data (keyword only)
and improves as labeled data accumulates.
"""

import json
import re
import math
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent.parent / "data"


def load_sif_keywords() -> dict:
    with open(DATA_DIR / "sif_keywords.json", "r") as f:
        return json.load(f)


SIF_KEYWORDS = load_sif_keywords()


def keyword_score(text: str) -> tuple[float, dict]:
    """
    Stage 1: Keyword-based SIF scoring using weighted taxonomy.
    
    Returns:
        score: Raw keyword score (0-100)
        matched: Dict of {category: [matched_terms]}
    """
    text_lower = text.lower()
    total_weight = 0.0
    matched = {}
    max_possible = sum(cat["weight"] for cat in SIF_KEYWORDS.values())

    for category, data in SIF_KEYWORDS.items():
        cat_matches = []
        for term in data["terms"]:
            if re.search(r'\b' + re.escape(term.lower()) + r'\b', text_lower):
                cat_matches.append(term)

        if cat_matches:
            # Partial credit within category: sqrt dampening to prevent
            # a single category from dominating
            matches_factor = min(1.0, math.sqrt(len(cat_matches) / 3))
            total_weight += data["weight"] * matches_factor
            matched[category] = cat_matches

    # Normalize to 0-100
    raw_score = min(100.0, (total_weight / max_possible) * 100 * 2.5)
    return raw_score, matched


class SIFClassifier:
    """
    SIF Potential Classifier with keyword + optional ML fusion.
    
    Works in two modes:
    - Keyword-only (no training data needed, immediate deployment)
    - Fused (keyword + TF-IDF LR after fitting on seed data)
    """

    def __init__(self, ml_weight: float = 0.0):
        """
        Args:
            ml_weight: Weight given to ML model score (0.0 = keyword-only).
                       Set to 0.6 after fitting on seed data.
        """
        self.ml_weight = ml_weight
        self.keyword_weight = 1.0 - ml_weight
        self._vectorizer = None
        self._model = None
        self._fitted = False

    def fit(self, texts: list[str], labels: list[bool]) -> "SIFClassifier":
        """
        Train TF-IDF + Logistic Regression on labeled seed data.
        
        Args:
            texts: Preprocessed report texts
            labels: SIF-potential labels (True/False)
        
        Returns:
            self (for chaining)
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.linear_model import LogisticRegression
            from sklearn.pipeline import Pipeline

            self._vectorizer = TfidfVectorizer(
                ngram_range=(1, 3),
                max_features=5000,
                min_df=1,
                sublinear_tf=True
            )
            self._model = LogisticRegression(
                C=1.0,
                class_weight="balanced",  # Critical: recall-biased for SIF
                max_iter=500
            )

            X = self._vectorizer.fit_transform(texts)
            y = [1 if lbl else 0 for lbl in labels]
            self._model.fit(X, y)
            self._fitted = True
            self.ml_weight = 0.6
            self.keyword_weight = 0.4
            return self

        except ImportError:
            print("[SIFClassifier] scikit-learn not available — keyword-only mode.")
            return self

    def predict(self, text: str) -> dict:
        """
        Classify a single preprocessed report text.
        
        Returns:
            {
                "sif_potential": bool,
                "sif_score": int (0-100),
                "keyword_score": float,
                "ml_score": float | None,
                "matched_categories": dict,
                "confidence": str ("high"/"medium"/"low")
            }
        """
        kw_score, matched = keyword_score(text)
        ml_score_val = None

        if self._fitted and self._vectorizer and self._model:
            try:
                X = self._vectorizer.transform([text])
                prob = self._model.predict_proba(X)[0][1]  # P(SIF=True)
                ml_score_val = prob * 100
            except Exception:
                pass

        # Fuse scores
        if ml_score_val is not None:
            final = self.keyword_weight * kw_score + self.ml_weight * ml_score_val
        else:
            final = kw_score

        final = min(100, max(0, final))
        sif_potential = final >= 50

        # Confidence band
        if final >= 80 or final <= 20:
            confidence = "high"
        elif final >= 65 or final <= 35:
            confidence = "medium"
        else:
            confidence = "low"

        return {
            "sif_potential": sif_potential,
            "sif_score": round(final),
            "keyword_score": round(kw_score, 1),
            "ml_score": round(ml_score_val, 1) if ml_score_val is not None else None,
            "matched_categories": matched,
            "confidence": confidence
        }

    def predict_batch(self, texts: list[str]) -> list[dict]:
        return [self.predict(t) for t in texts]


# Module-level singleton — loaded once at import
_classifier: Optional[SIFClassifier] = None


def get_classifier() -> SIFClassifier:
    """
    Get or initialize the singleton SIF classifier, loading pre-trained model if available.
    """
    global _classifier
    if _classifier is not None:
        return _classifier

    _classifier = SIFClassifier()

    # Priority 1: Load pre-trained model trained on 3,000 dataset records
    model_path = DATA_DIR / "sif_model.joblib"
    if model_path.exists():
        try:
            import joblib
            pipeline = joblib.load(model_path)
            _classifier._vectorizer = pipeline.named_steps["tfidf"]
            _classifier._model = pipeline.named_steps["clf"]
            _classifier._fitted = True
            _classifier.ml_weight = 0.75
            _classifier.keyword_weight = 0.25
            print(f"[SIFClassifier] Successfully loaded trained ML model from {model_path} (trained on 3,000 dataset records).")
            return _classifier
        except Exception as e:
            print(f"[SIFClassifier] Error loading joblib model ({e}), falling back to seed data.")

    # Priority 2: Bootstrap on seed data
    try:
        import sys
        sys.path.insert(0, str(DATA_DIR.parent))
        from data.seed_data import SEED_REPORTS
        from engine.preprocessor import preprocess

        texts = [preprocess(r["text"]) for r in SEED_REPORTS]
        labels = [r["sif_potential"] for r in SEED_REPORTS]
        _classifier.fit(texts, labels)
        print(f"[SIFClassifier] Fitted on {len(SEED_REPORTS)} seed reports.")
    except Exception as e:
        print(f"[SIFClassifier] Keyword-only mode: {e}")

    return _classifier

