"""
IOGP Life-Saving Rule (LSR) Multi-Label Tagger.

Assigns each report to one or more of the 9 IOGP Life-Saving Rules:
  - Bypassing Safety Controls
  - Confined Space
  - Driving
  - Energy Isolation
  - Hot Work
  - Line of Fire
  - Safe Mechanical Lifting
  - Work Authorisation
  - Working at Height

Uses keyword-per-rule classification with confidence scoring.
Each rule fires independently (multi-label, not mutually exclusive).
"""

import json
import re
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

LSR_RULES = [
    "Energy Isolation",
    "Hot Work",
    "Confined Space",
    "Working at Height",
    "Line of Fire",
    "Safe Mechanical Lifting",
    "Work Authorisation",
    "Driving",
    "Bypassing Safety Controls"
]


def load_lsr_keywords() -> dict:
    with open(DATA_DIR / "lsr_keywords.json", "r") as f:
        return json.load(f)


LSR_KEYWORDS = load_lsr_keywords()


def score_rule(text: str, rule_name: str) -> tuple[float, list[str]]:
    """
    Score a single LSR rule against the report text.
    
    Returns:
        confidence: 0.0-1.0
        matched_terms: list of matched keywords
    """
    if rule_name not in LSR_KEYWORDS:
        return 0.0, []

    rule_data = LSR_KEYWORDS[rule_name]
    text_lower = text.lower()
    matched = []

    for term in rule_data["keywords"]:
        if re.search(r'\b' + re.escape(term.lower()) + r'\b', text_lower):
            matched.append(term)

    if not matched:
        return 0.0, []

    total_kw = len(rule_data["keywords"])
    # Score based on hits — diminishing returns, caps at 1.0
    raw_score = min(1.0, len(matched) / max(3, total_kw * 0.15))
    # Apply rule weight
    score = raw_score * rule_data.get("weight", 1.0)
    return round(min(1.0, score), 3), matched


class LSRTagger:
    """
    Multi-label IOGP Life-Saving Rule tagger.
    Operates per-rule independently.
    """

    CONFIDENCE_THRESHOLD = 0.15  # Minimum score to fire a rule

    def __init__(self):
        self._ml_model = None
        ml_path = DATA_DIR / "lsr_model.joblib"
        if ml_path.exists():
            try:
                import joblib
                self._ml_model = joblib.load(ml_path)
                print(f"[LSRTagger] Loaded trained ML model from {ml_path}")
            except Exception as e:
                print(f"[LSRTagger] Could not load ML model: {e}")

    def tag(self, text: str) -> dict:
        """
        Tag a preprocessed report text with applicable LSRs.

        Returns:
            {
                "tags": list[str],           # Rules above threshold
                "scores": dict[str, float],  # Confidence per rule
                "matched_terms": dict[str, list[str]],  # Matched keywords per rule
                "primary_rule": str | None   # Highest confidence rule
            }
        """
        all_scores = {}
        all_matches = {}

        for rule in LSR_RULES:
            score, matches = score_rule(text, rule)
            all_scores[rule] = score
            if matches:
                all_matches[rule] = matches

        # Integrate ML predictions if model is fitted
        if self._ml_model is not None:
            try:
                classes = list(self._ml_model.classes_)
                probas = self._ml_model.predict_proba([text])[0]
                top_idx = probas.argmax()
                ml_top_class = classes[top_idx]
                ml_top_prob = float(probas[top_idx])

                if ml_top_prob >= 0.20:
                    for cls_name, prob in zip(classes, probas):
                        if cls_name in all_scores:
                            # Fuse keyword score and ML probability
                            fused = max(all_scores[cls_name], float(prob))
                            all_scores[cls_name] = round(fused, 3)
                        elif prob >= 0.35:
                            all_scores[cls_name] = round(float(prob), 3)
            except Exception as e:
                pass

        # Fire rules above threshold
        fired_rules = [
            rule for rule, score in all_scores.items()
            if score >= self.CONFIDENCE_THRESHOLD
        ]

        # Sort by confidence descending
        fired_rules.sort(key=lambda r: all_scores[r], reverse=True)

        primary_rule = fired_rules[0] if fired_rules else None

        if not fired_rules:
            fired_rules = ["Unclassified"]

        return {
            "tags": fired_rules,
            "scores": {r: all_scores.get(r, 0.0) for r in LSR_RULES},
            "matched_terms": all_matches,
            "primary_rule": primary_rule
        }

    def tag_batch(self, texts: list[str]) -> list[dict]:
        return [self.tag(t) for t in texts]


# Module-level singleton
_tagger = None


def get_tagger() -> LSRTagger:
    global _tagger
    if _tagger is None:
        _tagger = LSRTagger()
    return _tagger

