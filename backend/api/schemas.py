"""
Pydantic schemas for FastAPI request/response models.
"""

from pydantic import BaseModel, Field
from typing import Optional


class ReportInput(BaseModel):
    """Single report for classification."""
    text: str = Field(..., description="Raw free-text report content")
    report_id: Optional[str] = Field(None, description="Optional report identifier")
    site: Optional[str] = Field(None, description="Site/location name")
    department: Optional[str] = Field(None, description="Department or business unit")
    activity: Optional[str] = Field(None, description="Activity type")
    report_type: Optional[str] = Field(None, description="UA/UC/Near Miss/Incident")
    report_date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")
    reporter_role: Optional[str] = Field(None, description="Role of the reporter")

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Contractor was working on an energized panel without verifying isolation. No LOTO tag observed. Near miss — no injury.",
                "report_id": "RPT-2025-001",
                "site": "Duliajan",
                "department": "Electrical",
                "activity": "Electrical Maintenance",
                "report_type": "Near Miss",
                "report_date": "2025-08-01",
                "reporter_role": "Supervisor"
            }
        }


class BatchReportInput(BaseModel):
    """Multiple reports for batch classification."""
    reports: list[ReportInput]


class HighlightedSpan(BaseModel):
    start: int
    end: int
    text: str
    category: str
    severity: str


class ClassificationResult(BaseModel):
    """Full classification output for one report."""
    report_id: Optional[str]
    
    # Original input
    original_text: str
    preprocessed_text: str
    
    # SIF classification
    sif_potential: bool
    sif_score: int = Field(..., ge=0, le=100, description="SIF potential score 0-100")
    sif_confidence: str = Field(..., description="high/medium/low")
    
    # LSR tagging
    life_saving_rules: list[str]
    lsr_scores: dict[str, float]
    primary_rule: Optional[str]
    
    # Explainability
    precursor_factors: list[str]
    barrier_failures: list[str]
    highlighted_spans: list[HighlightedSpan]
    plain_language_explanation: str
    
    # Metadata echo
    site: Optional[str]
    department: Optional[str]
    activity: Optional[str]
    report_type: Optional[str]
    report_date: Optional[str]


class AnalyticsDensityItem(BaseModel):
    group: str
    total_reports: int
    sif_count: int
    sif_density: float
    avg_sif_score: float
    risk_level: str


class AnalyticsTrendItem(BaseModel):
    week_start: str
    week_end: str
    total_reports: int
    sif_count: int
    sif_density: float


class ClusterSummary(BaseModel):
    cluster_name: str
    report_count: int
    sif_count: int
    sif_rate: float
    top_sites: dict
    risk_level: str


class LSRBreakdownItem(BaseModel):
    rule: str
    count: int
    percentage: float


class HealthResponse(BaseModel):
    status: str
    classifier_mode: str
    seed_reports_loaded: int
    version: str


# ─── RBAC & Governance Schemas ────────────────────────────────────────────────
class ReviewActionInput(BaseModel):
    """Safety Officer / Statutory Reviewer triage sign-off or override."""
    reviewer_id: str = Field(..., description="Employee / Officer ID (e.g. OIL-SO-4091)")
    reviewer_name: str = Field(..., description="Name of Safety Officer / Reviewer")
    reviewer_role: str = Field(..., description="Role: 'field_engineer', 'safety_officer', 'statutory_reviewer'")
    action: str = Field(..., description="'APPROVED', 'OVERRIDDEN', 'ESCALATED_STATUTORY'")
    override_sif_score: Optional[int] = Field(None, ge=0, le=100, description="Override score if modified")
    override_sif_potential: Optional[bool] = Field(None, description="Override SIF status if modified")
    override_lsr: Optional[str] = Field(None, description="Override Life-Saving Rule category")
    reviewer_notes: str = Field(..., description="Statutory triage rationale and compliance notes")
    oisd_clause: Optional[str] = Field("OISD-GDN-166 Sec 5.2", description="Applicable statutory safety standard clause")


class AuditLogEntry(BaseModel):
    """Immutable audit trail entry for every statutory triage decision."""
    audit_id: str
    timestamp: str
    report_id: str
    report_text: str
    model_version: str
    model_sif_score: int
    final_sif_score: int
    model_sif_potential: bool
    final_sif_potential: bool
    model_lsr: Optional[str]
    final_lsr: Optional[str]
    reviewer_id: str
    reviewer_name: str
    reviewer_role: str
    action: str
    reviewer_notes: str
    oisd_clause: str
    statutory_alert_triggered: bool


class RetrainingPolicyInfo(BaseModel):
    """Formal retraining trigger criteria and safety guardrails."""
    current_model_version: str
    trigger_calendar: str
    trigger_volume: str
    min_recall_threshold: float
    backup_checkpoint_available: bool
    backup_path: Optional[str]
    governance_standard: str

