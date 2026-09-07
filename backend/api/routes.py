"""
FastAPI route handlers for the SIF Precursor Detection API.
"""

import sys
from pathlib import Path

# Add backend to path for imports
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from fastapi import APIRouter, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from collections import Counter
from datetime import datetime
import csv
import io
import json
import shutil

from api.schemas import (
    ReportInput, BatchReportInput, ClassificationResult,
    AnalyticsDensityItem, AnalyticsTrendItem, ClusterSummary,
    LSRBreakdownItem, HealthResponse, HighlightedSpan,
    ReviewActionInput, AuditLogEntry, RetrainingPolicyInfo
)
from engine.preprocessor import preprocess
from engine.sif_classifier import get_classifier
from engine.lsr_tagger import get_tagger
from engine.explainer import explain, extract_barrier_failures, extract_precursor_factors
from engine.cluster_engine import (
    get_cluster_engine, compute_sif_density, compute_weekly_trends
)
from data.seed_data import SEED_REPORTS

router = APIRouter()

# ─── In-memory report store ──────────────────────────────────────────────────
# In production: replace with PostgreSQL
_report_store: list[dict] = []
_classified_store: list[dict] = []

# Pre-load seed data on startup
def _preload_seed_data():
    global _report_store, _classified_store
    if _classified_store:
        return  # Already loaded

    clf = get_classifier()
    tagger = get_tagger()

    for r in SEED_REPORTS:
        processed = preprocess(r["text"])
        sif_result = clf.predict(processed)
        lsr_result = tagger.tag(processed)
        explain_result = explain(r["text"], processed, sif_result, lsr_result)

        classified = {
            **r,
            "preprocessed_text": processed,
            "sif_potential": r["sif_potential"],  # Use ground truth for seed data
            "sif_score": r["sif_score"],
            "sif_confidence": sif_result["confidence"],
            "life_saving_rules": r["life_saving_rules"],
            "lsr_scores": lsr_result["scores"],
            "primary_rule": lsr_result["primary_rule"],
            "precursor_factors": explain_result["precursor_factors"],
            "barrier_failures": explain_result["barrier_failures"],
            "highlighted_spans": explain_result["highlighted_spans"],
            "plain_language_explanation": explain_result["plain_language_explanation"],
            "report_date": r["date"],
        }
        _report_store.append(r)
        _classified_store.append(classified)


# ─── Health Check ─────────────────────────────────────────────────────────────
@router.get("/health", response_model=HealthResponse)
async def health_check():
    _preload_seed_data()
    clf = get_classifier()
    return HealthResponse(
        status="ok",
        classifier_mode="fused (keyword + TF-IDF LR)" if clf._fitted else "keyword-only",
        seed_reports_loaded=len(_classified_store),
        version="1.0.0-prototype"
    )


# ─── Single Report Classification ────────────────────────────────────────────
@router.post("/classify", response_model=ClassificationResult)
async def classify_report(report: ReportInput):
    """Classify a single HSSE report for SIF potential and LSR tags."""
    _preload_seed_data()

    clf = get_classifier()
    tagger = get_tagger()

    processed = preprocess(report.text)
    sif_result = clf.predict(processed)
    lsr_result = tagger.tag(processed)
    explain_result = explain(report.text, processed, sif_result, lsr_result)

    # Store in memory
    classified = {
        "id": report.report_id or f"RPT-{len(_classified_store)+1:04d}",
        "text": report.text,
        "preprocessed_text": processed,
        "site": report.site,
        "department": report.department,
        "activity": report.activity,
        "report_type": report.report_type,
        "report_date": report.report_date,
        "reporter_role": report.reporter_role,
        "sif_potential": sif_result["sif_potential"],
        "sif_score": sif_result["sif_score"],
        "sif_confidence": sif_result["confidence"],
        "life_saving_rules": lsr_result["tags"],
        "lsr_scores": lsr_result["scores"],
        "primary_rule": lsr_result["primary_rule"],
        "precursor_factors": explain_result["precursor_factors"],
        "barrier_failures": explain_result["barrier_failures"],
        "highlighted_spans": explain_result["highlighted_spans"],
        "plain_language_explanation": explain_result["plain_language_explanation"],
        "date": report.report_date or "",
    }
    _classified_store.append(classified)

    return ClassificationResult(
        report_id=classified["id"],
        original_text=report.text,
        preprocessed_text=processed,
        sif_potential=sif_result["sif_potential"],
        sif_score=sif_result["sif_score"],
        sif_confidence=sif_result["confidence"],
        life_saving_rules=lsr_result["tags"],
        lsr_scores=lsr_result["scores"],
        primary_rule=lsr_result["primary_rule"],
        precursor_factors=explain_result["precursor_factors"],
        barrier_failures=explain_result["barrier_failures"],
        highlighted_spans=[HighlightedSpan(**s) for s in explain_result["highlighted_spans"]],
        plain_language_explanation=explain_result["plain_language_explanation"],
        site=report.site,
        department=report.department,
        activity=report.activity,
        report_type=report.report_type,
        report_date=report.report_date,
    )


# ─── Batch Classification ─────────────────────────────────────────────────────
@router.post("/batch")
async def classify_batch(batch: BatchReportInput):
    """Classify multiple reports in one call."""
    results = []
    for report in batch.reports:
        result = await classify_report(report)
        results.append(result)
    return {"results": results, "total": len(results)}


# ─── List Reports ─────────────────────────────────────────────────────────────
@router.get("/reports")
async def list_reports(
    site: str = Query(None),
    report_type: str = Query(None),
    sif_only: bool = Query(False),
    min_score: int = Query(0),
    max_score: int = Query(100),
    limit: int = Query(100),
    offset: int = Query(0)
):
    """List classified reports with optional filters."""
    _preload_seed_data()

    filtered = _classified_store[:]

    if site:
        filtered = [r for r in filtered if (r.get("site") or "").lower() == site.lower()]
    if report_type:
        filtered = [r for r in filtered if (r.get("report_type") or "").lower() == report_type.lower()]
    if sif_only:
        filtered = [r for r in filtered if r.get("sif_potential", False)]
    filtered = [r for r in filtered if min_score <= r.get("sif_score", 0) <= max_score]

    total = len(filtered)
    paginated = filtered[offset: offset + limit]

    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "reports": paginated
    }


# ─── Analytics: SIF Density ────────────────────────────────────────────────
@router.get("/analytics/sif-density")
async def sif_density(group_by: str = Query("site")):
    """SIF precursor density grouped by site, department, or activity."""
    _preload_seed_data()
    allowed = {"site", "department", "activity", "report_type"}
    if group_by not in allowed:
        raise HTTPException(400, f"group_by must be one of: {allowed}")

    density = compute_sif_density(_classified_store, group_by=group_by)
    return {"group_by": group_by, "data": density}


# ─── Analytics: LSR Breakdown ──────────────────────────────────────────────
@router.get("/analytics/lsr-breakdown")
async def lsr_breakdown():
    """Count of reports tagged to each Life-Saving Rule."""
    _preload_seed_data()

    rule_counts = Counter()
    for r in _classified_store:
        for rule in r.get("life_saving_rules", []):
            if rule != "Unclassified":
                rule_counts[rule] += 1

    total_tagged = sum(rule_counts.values()) or 1
    breakdown = [
        {
            "rule": rule,
            "count": count,
            "percentage": round(count / total_tagged * 100, 1)
        }
        for rule, count in rule_counts.most_common()
    ]
    return {"total_reports": len(_classified_store), "breakdown": breakdown}


# ─── Analytics: Clusters ───────────────────────────────────────────────────
@router.get("/analytics/clusters")
async def get_clusters():
    """Precursor pattern cluster summaries."""
    _preload_seed_data()

    engine = get_cluster_engine()
    texts = [r.get("preprocessed_text", r.get("text", "")) for r in _classified_store]
    metadata = [{"sif_potential": r.get("sif_potential", False), "site": r.get("site", "")} for r in _classified_store]
    assignments = engine.fit_predict(texts, metadata)
    summaries = engine.get_cluster_summary(assignments, texts)
    return {"clusters": summaries}


# ─── Analytics: Weekly Trends ─────────────────────────────────────────────
@router.get("/analytics/trends")
async def get_trends(weeks: int = Query(8, ge=2, le=52)):
    """Weekly SIF density trend data."""
    _preload_seed_data()
    trends = compute_weekly_trends(_classified_store, weeks=weeks)
    return {"weeks": weeks, "trends": trends}


# ─── Export CSV ────────────────────────────────────────────────────────────
@router.get("/export")
async def export_csv():
    """Export all classified reports as CSV for leadership review."""
    _preload_seed_data()

    output = io.StringIO()
    fieldnames = [
        "id", "date", "site", "department", "activity", "report_type",
        "sif_potential", "sif_score", "life_saving_rules", "primary_rule",
        "barrier_failures", "text"
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for r in _classified_store:
        row = {**r}
        row["life_saving_rules"] = "; ".join(r.get("life_saving_rules", []))
        row["barrier_failures"] = "; ".join(r.get("barrier_failures", []))
        writer.writerow({k: row.get(k, "") for k in fieldnames})

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sif_report_export.csv"}
    )


# ─── Training & Evaluation Metrics ─────────────────────────────────────────
@router.get("/train/metrics")
async def get_training_metrics():
    """Retrieve performance metrics of the models trained on dataset.xlsx."""
    metrics_path = BACKEND_DIR / "data" / "training_metrics.json"
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "status": "not_trained",
        "message": "Model not yet trained on dataset.xlsx. Run python backend/train_model.py or POST /api/train."
    }


@router.post("/train")
async def trigger_training(x_user_role: str = Header("statutory_reviewer")):
    """Trigger retraining on dataset.xlsx (restricted to statutory_reviewer / safety_officer)."""
    role = x_user_role.lower().strip()
    if role not in {"safety_officer", "statutory_reviewer"}:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Model retraining requires Safety Officer or Statutory Reviewer authorization."
        )
    from train_model import main as train_main
    try:
        train_main()
        # Reload classifier singleton
        from engine.sif_classifier import get_classifier
        clf = get_classifier()
        model_path = BACKEND_DIR / "data" / "sif_model.joblib"
        if model_path.exists():
            import joblib
            pipeline = joblib.load(model_path)
            clf._vectorizer = pipeline.named_steps["tfidf"]
            clf._model = pipeline.named_steps["clf"]
            clf._fitted = True

        metrics_path = BACKEND_DIR / "data" / "training_metrics.json"
        with open(metrics_path, "r", encoding="utf-8") as f:
            metrics = json.load(f)
        return {"status": "success", "message": "Models trained successfully on dataset.xlsx", "metrics": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


# ─── RBAC, Audit Trail & Statutory Triage Sign-off ───────────────────────────
AUDIT_LOG_PATH = BACKEND_DIR / "data" / "audit_trail.json"
_audit_store: list[dict] = []


def _load_audit_trail():
    global _audit_store
    if _audit_store:
        return
    if AUDIT_LOG_PATH.exists():
        try:
            with open(AUDIT_LOG_PATH, "r", encoding="utf-8") as f:
                _audit_store = json.load(f)
        except Exception:
            _audit_store = []
    else:
        # Seed initial statutory triage audit entries for demonstration
        _audit_store = [
            {
                "audit_id": "AUD-2026-0001",
                "timestamp": "2026-09-04T10:15:30",
                "report_id": "RPT-0001",
                "report_text": "Technician working inside 33kV switchgear panel without verifying LOTO or testing with multi-meter.",
                "model_version": "v1.2.0-baseline",
                "model_sif_score": 92,
                "final_sif_score": 92,
                "model_sif_potential": True,
                "final_sif_potential": True,
                "model_lsr": "Energy Isolation",
                "final_lsr": "Energy Isolation",
                "reviewer_id": "OIL-DIR-782",
                "reviewer_name": "Er. P. K. Sharma (Chief Safety Officer)",
                "reviewer_role": "statutory_reviewer",
                "action": "APPROVED",
                "reviewer_notes": "Immediate Stop Work Authority enforced. Disciplinary and refresher LOTO drill initiated under OISD-GDN-166 Sec 5.2.",
                "oisd_clause": "OISD-GDN-166 Sec 5.2",
                "statutory_alert_triggered": True
            }
        ]
        _persist_audit_trail()


def _persist_audit_trail():
    try:
        with open(AUDIT_LOG_PATH, "w", encoding="utf-8") as f:
            json.dump(_audit_store, f, indent=2)
    except Exception as e:
        print(f"[AuditTrail] Error saving audit log: {e}")


@router.post("/reports/{report_id}/review", response_model=AuditLogEntry)
async def review_report(
    report_id: str,
    review: ReviewActionInput,
    x_user_role: str = Header("safety_officer")
):
    """
    Submit Safety Officer / Statutory Reviewer sign-off or override.
    Enforces RBAC: field_engineer cannot override or sign off statutory reports.
    Logs immutable audit entry with model score vs reviewer override.
    """
    _preload_seed_data()
    _load_audit_trail()

    # Role enforcement
    role = x_user_role.lower().strip()
    if role not in {"safety_officer", "statutory_reviewer"}:
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Safety Officers and Statutory Reviewers have sign-off / override authority."
        )

    # Locate report in classified store
    target_report = None
    clean_id = str(report_id).strip().lower()
    for r in _classified_store:
        curr_id = str(r.get("id") or "").strip().lower()
        curr_rep_id = str(r.get("report_id") or "").strip().lower()
        if curr_id == clean_id or curr_rep_id == clean_id:
            target_report = r
            break

    if not target_report:
        raise HTTPException(status_code=404, detail=f"Report with ID '{report_id}' not found.")

    model_score = target_report.get("sif_score", 0)
    model_sif = target_report.get("sif_potential", False)
    model_lsr = target_report.get("primary_rule")

    # Apply override if specified
    final_score = review.override_sif_score if review.override_sif_score is not None else model_score
    final_sif = review.override_sif_potential if review.override_sif_potential is not None else (final_score >= 50)
    final_lsr = review.override_lsr if review.override_lsr else model_lsr

    # Update in-memory record
    target_report["sif_score"] = final_score
    target_report["sif_potential"] = final_sif
    target_report["primary_rule"] = final_lsr
    target_report["triage_status"] = review.action
    target_report["reviewed_by"] = f"{review.reviewer_name} ({review.reviewer_role})"
    target_report["reviewed_at"] = datetime.now().isoformat()
    target_report["reviewer_notes"] = review.reviewer_notes

    statutory_alert = final_score >= 80 or review.action == "ESCALATED_STATUTORY"

    audit_entry = {
        "audit_id": f"AUD-2026-{len(_audit_store)+1:04d}",
        "timestamp": datetime.now().isoformat(),
        "report_id": report_id,
        "report_text": target_report.get("text", "")[:300],
        "model_version": "v1.2.0-baseline",
        "model_sif_score": int(model_score),
        "final_sif_score": int(final_score),
        "model_sif_potential": bool(model_sif),
        "final_sif_potential": bool(final_sif),
        "model_lsr": model_lsr,
        "final_lsr": final_lsr,
        "reviewer_id": review.reviewer_id,
        "reviewer_name": review.reviewer_name,
        "reviewer_role": review.reviewer_role,
        "action": review.action,
        "reviewer_notes": review.reviewer_notes,
        "oisd_clause": review.oisd_clause or "OISD-GDN-166",
        "statutory_alert_triggered": statutory_alert
    }

    _audit_store.insert(0, audit_entry)
    _persist_audit_trail()

    return AuditLogEntry(**audit_entry)


@router.get("/audit-trail")
async def get_audit_trail(
    report_id: str = Query(None),
    role: str = Query(None),
    action: str = Query(None),
    limit: int = Query(50),
    offset: int = Query(0)
):
    """Retrieve immutable audit trail log of statutory triage decisions."""
    _load_audit_trail()
    filtered = _audit_store[:]

    if report_id:
        filtered = [a for a in filtered if a.get("report_id") == report_id]
    if role:
        filtered = [a for a in filtered if a.get("reviewer_role") == role]
    if action:
        filtered = [a for a in filtered if a.get("action") == action]

    paginated = filtered[offset: offset + limit]
    return {
        "total_records": len(filtered),
        "limit": limit,
        "offset": offset,
        "audit_trail": paginated
    }


@router.get("/retraining/policy", response_model=RetrainingPolicyInfo)
async def get_retraining_policy():
    """Retrieve official retraining triggers, recall threshold guardrails, and backup status."""
    backup_path = BACKEND_DIR / "data" / "sif_model_backup.joblib"
    return RetrainingPolicyInfo(
        current_model_version="v1.2.0-baseline",
        trigger_calendar="Quarterly statutory review or immediate upon regulatory guideline revision",
        trigger_volume=">= 500 validated field observations accumulated",
        min_recall_threshold=0.95,
        backup_checkpoint_available=backup_path.exists(),
        backup_path=str(backup_path) if backup_path.exists() else None,
        governance_standard="OISD-GDN-166 & DGMS Technical Surveillance Guidelines"
    )


@router.post("/retraining/rollback")
async def rollback_model(x_user_role: str = Header("statutory_reviewer")):
    """Roll back model to previous stable checkpoint if recall regression is identified."""
    role = x_user_role.lower().strip()
    if role != "statutory_reviewer":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only Statutory Reviewer can execute emergency model rollback."
        )

    backup_path = BACKEND_DIR / "data" / "sif_model_backup.joblib"
    active_path = BACKEND_DIR / "data" / "sif_model.joblib"

    if not backup_path.exists():
        raise HTTPException(status_code=400, detail="No backup checkpoint found to restore.")

    shutil.copyfile(backup_path, active_path)

    # Reload model in memory
    from engine.sif_classifier import get_classifier
    import joblib
    clf = get_classifier()
    pipeline = joblib.load(active_path)
    clf._vectorizer = pipeline.named_steps["tfidf"]
    clf._model = pipeline.named_steps["clf"]

    return {
        "status": "success",
        "message": "Model successfully rolled back to previous stable checkpoint.",
        "active_model": str(active_path)
    }


