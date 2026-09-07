"""
Text preprocessor for OIL HSSE reports.
Handles: cleaning, abbreviation expansion, normalization.
"""

import re
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"


def load_abbreviations() -> dict:
    """Load domain-specific abbreviation dictionary."""
    abbr_path = DATA_DIR / "abbreviations.json"
    with open(abbr_path, "r") as f:
        return json.load(f)


ABBREVIATIONS = load_abbreviations()

# Compile abbreviation patterns (word-boundary aware, case-insensitive)
_ABBR_PATTERNS = {
    re.compile(r'\b' + re.escape(abbr) + r'\b', re.IGNORECASE): expansion
    for abbr, expansion in ABBREVIATIONS.items()
}


def expand_abbreviations(text: str) -> str:
    """Replace domain abbreviations with full forms."""
    for pattern, expansion in _ABBR_PATTERNS.items():
        text = pattern.sub(expansion, text)
    return text


def clean_text(text: str) -> str:
    """
    Basic text cleaning:
    - Normalize whitespace
    - Remove excessive punctuation
    - Standardize dashes and quotes
    """
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)          # Collapse whitespace
    text = re.sub(r'["""]', '"', text)         # Normalize quotes
    text = re.sub(r'[–—]', '-', text)          # Normalize dashes
    text = re.sub(r'\.{2,}', '.', text)        # Collapse ellipses
    return text


def normalize_entities(text: str) -> str:
    """
    Normalize common entity spellings in OIL reports.
    E.g., multiple ways to say the same thing.
    """
    normalizations = [
        (r'\bH2S\b', 'hydrogen sulfide H2S'),
        (r'\bBOP\b', 'blowout preventer BOP'),
        (r'\bGGS\b', 'Group Gathering Station GGS'),
        (r'\bCGS\b', 'Central Gathering Station CGS'),
        (r'\bFMP\b', 'Flow Measurement Point FMP'),
        (r'\bROW\b', 'Right of Way ROW'),
    ]
    for pattern, replacement in normalizations:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
    return text


def preprocess(text: str, expand_abbr: bool = True) -> str:
    """
    Full preprocessing pipeline.

    Args:
        text: Raw report text
        expand_abbr: Whether to expand abbreviations (default True)

    Returns:
        Cleaned, normalized text ready for feature extraction
    """
    text = clean_text(text)
    if expand_abbr:
        text = expand_abbreviations(text)
    text = normalize_entities(text)
    text = clean_text(text)  # Second pass after expansion
    return text


def preprocess_batch(texts: list[str]) -> list[str]:
    """Preprocess a list of report texts."""
    return [preprocess(t) for t in texts]

