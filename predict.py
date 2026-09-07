"""
Inference Module for OIL India SIF Precursor Detection
======================================================
Provides classify(text) function serving trained baseline models.
"""

from pathlib import Path
import re
import joblib
import numpy as np

BASE_DIR = Path(__file__).parent.resolve()

# Locate models either in root or backend/data
def _find_path(filename: str) -> Path:
    candidates = [
        BASE_DIR / filename,
        BASE_DIR / "backend" / "data" / filename,
        BASE_DIR / "models" / filename,
    ]
    for c in candidates:
        if c.exists():
            return c
    return BASE_DIR / filename

# Abbreviations mapping for domain preprocessing
ABBREVIATIONS = {
    "loto": "lockout tagout",
    "ptw": "permit to work",
    "scba": "self contained breathing apparatus",
    "ppe": "personal protective equipment",
    "mcc": "motor control centre",
    "bop": "blowout preventer",
    "h2s": "hydrogen sulfide",
    "swl": "safe working load",
}

def preprocess_text(text: str) -> str:
    if not text:
        return ""
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)
    for abbr, full in ABBREVIATIONS.items():
        t = re.sub(rf"\b{re.escape(abbr)}\b", full, t)
    return t

# Model cache
_MODELS = {
    "tfidf_sif": None,
    "model_sif": None,
    "tfidf_lsr": None,
    "model_lsr": None,
    "sif_pipeline": None,
    "lsr_pipeline": None,
}

def _load_artifacts():
    if _MODELS["tfidf_sif"] is not None:
        return

    # Check for split models or full pipelines
    sif_vec_path = _find_path("tfidf_vectorizer_sif.joblib")
    sif_clf_path = _find_path("model_sif_binary.joblib")
    lsr_vec_path = _find_path("tfidf_vectorizer_lsr.joblib")
    lsr_clf_path = _find_path("model_lsr_multilabel.joblib")

    if sif_vec_path.exists() and sif_clf_path.exists():
        _MODELS["tfidf_sif"] = joblib.load(sif_vec_path)
        _MODELS["model_sif"] = joblib.load(sif_clf_path)
    else:
        pipe_path = _find_path("sif_model.joblib")
        if pipe_path.exists():
            pipe = joblib.load(pipe_path)
            _MODELS["sif_pipeline"] = pipe
            _MODELS["tfidf_sif"] = pipe.named_steps["tfidf"]
            _MODELS["model_sif"] = pipe.named_steps["clf"]

    if lsr_vec_path.exists() and lsr_clf_path.exists():
        _MODELS["tfidf_lsr"] = joblib.load(lsr_vec_path)
        _MODELS["model_lsr"] = joblib.load(lsr_clf_path)
    else:
        pipe_path = _find_path("lsr_model.joblib")
        if pipe_path.exists():
            pipe = joblib.load(pipe_path)
            _MODELS["lsr_pipeline"] = pipe
            _MODELS["tfidf_lsr"] = pipe.named_steps["tfidf"]
            _MODELS["model_lsr"] = pipe.named_steps["clf"]

_load_artifacts()

def extract_precursor_factors(raw_text: str, top_n: int = 5) -> list:
    """Extract top TF-IDF-weighted terms relative to the SIF binary classifier."""
    tfidf = _MODELS.get("tfidf_sif")
    clf = _MODELS.get("model_sif")
    if tfidf is None or clf is None:
        return []

    proc = preprocess_text(raw_text)
    vec = tfidf.transform([proc]).toarray().squeeze()
    coef = clf.coef_.squeeze()
    scores = vec * coef
    nz_idx = np.where(vec > 0)[0]
    if len(nz_idx) == 0:
        return ["No prominent domain terms identified"]

    feature_names = tfidf.get_feature_names_out()
    ranked = sorted(
        [(feature_names[i], float(scores[i])) for i in nz_idx],
        key=lambda x: x[1],
        reverse=True
    )

    factors = []
    for term, score in ranked[:top_n]:
        tag = "SIF precursor signal" if score > 0 else "Low severity / routine indicator"
        factors.append(f"'{term}' ({tag}, weight={score:+.2f})")
    return factors

def classify(text: str) -> dict:
    """
    Classify a safety incident report text.
    Returns:
      sif_potential: bool
      sif_score: int (0-100 derived from model probability)
      life_saving_rules: list of predicted rule labels from ML model
      precursor_factors: top TF-IDF weighted terms
    """
    if not text or not text.strip():
        return {
            "sif_potential": False,
            "sif_score": 0,
            "life_saving_rules": ["Unclassified"],
            "precursor_factors": [],
        }

    _load_artifacts()
    proc = preprocess_text(text)

    # 1. SIF classification
    tfidf_sif = _MODELS["tfidf_sif"]
    model_sif = _MODELS["model_sif"]
    if tfidf_sif is not None and model_sif is not None:
        vec_sif = tfidf_sif.transform([proc])
        prob = float(model_sif.predict_proba(vec_sif)[0][1])
        sif_potential = bool(prob >= 0.5)
        sif_score = int(round(prob * 100))
    else:
        prob = 0.0
        sif_potential = False
        sif_score = 0

    # 2. LSR classification
    tfidf_lsr = _MODELS.get("tfidf_lsr")
    model_lsr = _MODELS.get("model_lsr")
    life_saving_rules = []
    if tfidf_lsr is not None and model_lsr is not None:
        try:
            vec_lsr = tfidf_lsr.transform([proc])
            pred_lsr = model_lsr.predict(vec_lsr)[0]
            if pred_lsr and str(pred_lsr) not in ("", "nan", "None", "Unclassified"):
                life_saving_rules = [str(pred_lsr)]
            else:
                life_saving_rules = ["Unclassified"]
        except Exception:
            life_saving_rules = ["Unclassified"]
    else:
        life_saving_rules = ["Unclassified"]

    # 3. Precursor factors
    precursor_factors = extract_precursor_factors(text, top_n=5)

    return {
        "sif_potential": sif_potential,
        "sif_score": sif_score,
        "life_saving_rules": life_saving_rules,
        "precursor_factors": precursor_factors,
    }

if __name__ == "__main__":
    sample = "Contractor working on energized MCC panel without LOTO tag or isolation."
    res = classify(sample)
    print("Sample Output:")
    import pprint
    pprint.pprint(res)
