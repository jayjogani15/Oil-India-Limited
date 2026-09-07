"""
Explainability engine for SIF classifications.

Provides:
  1. Token-level attribution: highlights which phrases drove the SIF score
  2. Plain-language explanation: HSE-readable summary of why a report was flagged
  3. Precursor factor extraction: structured list of barrier failures
"""

import re


# Barrier failure patterns — maps detected signals to human-readable descriptions
BARRIER_FAILURE_MAP = {
    # Isolation failures
    "no loto": "LOTO/Lockout-Tagout not applied",
    "loto not applied": "LOTO/Lockout-Tagout not applied",
    "loto missing": "LOTO/Lockout-Tagout not applied",
    "isolation not verified": "Isolation not verified before work",
    "not isolated": "Equipment not isolated before work",
    "not de-energized": "Equipment not de-energized",
    "isolation bypassed": "Isolation bypassed — critical control defeated",
    
    # Permit failures
    "no permit to work": "Permit to Work (PTW) not obtained",
    "without ptw": "Permit to Work (PTW) not obtained",
    "ptw not taken": "Permit to Work (PTW) not obtained",
    "permit expired": "PTW/Permit had expired",
    "no work permit": "Permit to Work (PTW) not obtained",
    "no hot work permit": "Hot Work Permit not obtained",
    
    # Gas/atmosphere failures
    "no gas test": "Gas test not performed before work",
    "gas test not done": "Gas test not performed before work",
    "no atmospheric test": "Atmospheric testing not conducted",
    "lel above": "Explosive atmosphere — LEL exceeded",
    "lel exceeded": "Explosive atmosphere — LEL exceeded",
    
    # Height/fall failures
    "no harness": "Fall protection harness not worn",
    "harness not worn": "Fall protection harness not worn",
    "no fall protection": "No fall protection in place",
    "fall arrest not": "Fall arrest system not connected",
    "no anchor point": "No anchor point for fall arrest",
    
    # Lifting failures
    "swl exceeded": "Safe Working Load (SWL) exceeded",
    "overloaded crane": "Crane overloaded",
    "no lifting plan": "No lifting plan prepared",
    "sling failure": "Rigging/Sling failure or deficiency",
    "rigging failure": "Rigging failure or deficiency",
    "crane inspection": "Crane inspection overdue/missing",
    
    # Supervision/procedure failures
    "worked alone": "Lone working — no standby/buddy",
    "working alone": "Lone working — no standby/buddy",
    "no supervision": "Supervision absent",
    "supervisor absent": "Supervision absent",
    "no attendant": "No attendant/standby for confined space",
    "no standby": "No standby/standby person absent",
    
    # Safety system bypass
    "bypassed": "Safety control bypassed — critical defense defeated",
    "defeated": "Safety device/interlock defeated",
    "alarm disabled": "Safety alarm disabled",
    "guard removed": "Machine guard removed — mechanical hazard exposed",
    "interlock bypass": "Safety interlock bypassed",
    
    # Vehicle
    "no seatbelt": "Seatbelt not worn",
    "seatbelt not worn": "Seatbelt not worn",
    "overspeeding": "Speeding — speed limit exceeded",
    "over speed": "Speeding — speed limit exceeded",
    "reverse without spotter": "Vehicle reversing without banksman/spotter",
}


def extract_highlighted_spans(text: str, matched_categories: dict) -> list[dict]:
    """
    Identify character spans in text that drove the SIF classification.
    
    Returns:
        List of {start, end, text, category, severity} dicts
    """
    spans = []
    text_lower = text.lower()

    for category, terms in matched_categories.items():
        for term in terms:
            pattern = re.compile(r'\b' + re.escape(term.lower()) + r'\b')
            for match in pattern.finditer(text_lower):
                spans.append({
                    "start": match.start(),
                    "end": match.end(),
                    "text": text[match.start():match.end()],
                    "category": category,
                    "severity": "critical" if category in [
                        "isolation_failure", "fire_explosion", "entrapment_engulfment"
                    ] else "high"
                })

    # Deduplicate overlapping spans (keep longer)
    spans.sort(key=lambda s: (s["start"], -(s["end"] - s["start"])))
    deduped = []
    last_end = -1
    for span in spans:
        if span["start"] >= last_end:
            deduped.append(span)
            last_end = span["end"]

    return deduped


def extract_barrier_failures(text: str) -> list[str]:
    """
    Extract structured barrier failure descriptions from text.
    Returns human-readable list for HSE review.
    """
    text_lower = text.lower()
    failures = []

    for pattern_text, description in BARRIER_FAILURE_MAP.items():
        if pattern_text in text_lower:
            if description not in failures:
                failures.append(description)

    return failures


def extract_precursor_factors(text: str, matched_categories: dict, lsr_tags: list[str]) -> list[str]:
    """
    Extract structured SIF precursor factors for the output schema.
    """
    factors = []

    cat_to_factor = {
        "energy_sources": "energy source present",
        "isolation_failure": "isolation control failure",
        "gravity_height": "gravity/height hazard",
        "mechanical_motion": "mechanical motion hazard",
        "fire_explosion": "fire/explosion potential",
        "entrapment_engulfment": "entrapment/engulfment risk",
        "motor_vehicle": "motor vehicle hazard",
        "supervision_human_factors": "supervision/procedure failure"
    }

    for cat, factor in cat_to_factor.items():
        if cat in matched_categories:
            # Get first matched term as example
            example_terms = matched_categories[cat][:2]
            factors.append(f"{factor}: {', '.join(example_terms)}")

    return factors


def generate_explanation(
    text: str,
    sif_score: int,
    matched_categories: dict,
    lsr_tags: list[str],
    barrier_failures: list[str]
) -> str:
    """
    Generate a plain-language explanation for HSE reviewers.
    """
    if sif_score < 50:
        return (
            f"This report was classified as NON-SIF-potential (score: {sif_score}/100). "
            "No significant SIF precursor signals were detected. "
            "The report appears to involve low-severity, low-energy hazards."
        )

    category_names = {
        "energy_sources": "energized equipment/pressure",
        "isolation_failure": "isolation control failure (LOTO/PTW)",
        "gravity_height": "height/gravity hazard",
        "mechanical_motion": "rotating/moving machinery",
        "fire_explosion": "fire/explosion hazard",
        "entrapment_engulfment": "confined space/engulfment",
        "motor_vehicle": "vehicle/road hazard",
        "supervision_human_factors": "supervision or procedural failure"
    }

    detected = [category_names.get(cat, cat) for cat in matched_categories.keys()]
    severity_band = "CRITICAL" if sif_score >= 85 else "HIGH" if sif_score >= 70 else "MODERATE"

    parts = [
        f"⚠️ SIF-POTENTIAL — {severity_band} (Score: {sif_score}/100).",
        f"Detected precursor signals: {', '.join(detected)}.",
    ]

    if barrier_failures:
        parts.append(f"Critical barrier failures: {'; '.join(barrier_failures[:3])}.")

    if lsr_tags and lsr_tags != ["Unclassified"]:
        parts.append(f"Applicable Life-Saving Rules: {', '.join(lsr_tags)}.")

    parts.append(
        "Immediate review and intervention recommended to prevent potential fatality or serious injury."
    )

    return " ".join(parts)


def explain(
    original_text: str,
    preprocessed_text: str,
    sif_result: dict,
    lsr_result: dict
) -> dict:
    """
    Full explainability output for a classified report.
    
    Returns:
        {
            "highlighted_spans": [...],
            "barrier_failures": [...],
            "precursor_factors": [...],
            "plain_language_explanation": str
        }
    """
    matched_cats = sif_result.get("matched_categories", {})
    lsr_tags = lsr_result.get("tags", [])
    sif_score = sif_result.get("sif_score", 0)

    spans = extract_highlighted_spans(original_text, matched_cats)
    barriers = extract_barrier_failures(preprocessed_text.lower())
    factors = extract_precursor_factors(preprocessed_text, matched_cats, lsr_tags)
    explanation = generate_explanation(
        original_text, sif_score, matched_cats, lsr_tags, barriers
    )

    return {
        "highlighted_spans": spans,
        "barrier_failures": barriers,
        "precursor_factors": factors,
        "plain_language_explanation": explanation
    }
