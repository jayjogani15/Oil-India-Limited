# OIL India — SIF Precursor Intelligence System (SPIS)
### AI/NLP Engine for Detecting Serious Injury & Fatality Precursors in HSSE Reports

> **Smart India Hackathon 2025 · Oil India Limited · HSSE Digital Intelligence**
> Compliant with **OISD-GDN-166**, **DGMS Statutory Triage**, and **IOGP Life-Saving Rules**

---

## What This Prototype Does

SPIS ingests free-text HSSE reports (Unsafe Acts, Unsafe Conditions, Near Misses, Incidents)
from Oil India Limited field operations and automatically:

1. **Classifies** each report as **SIF-Potential** or **Non-SIF-Potential**
   Returns a model-predicted probability score (0-100) from a trained TF-IDF + Logistic Regression classifier.

2. **Tags** the applicable **IOGP Life-Saving Rule** (Energy Isolation, Hot Work, Confined Space,
   Working at Height, Driving, Safe Mechanical Lifting, Line of Fire)
   Using a OneVsRest multi-class classifier trained on the same dataset.

3. **Identifies precursor signals** -- the specific terms that pushed the model toward a SIF verdict,
   extracted by multiplying TF-IDF term weights with trained LogReg coefficients.

4. **Surfaces site risk rankings** -- aggregates the 3,000-record dataset by site:
   SIF density (SIF / total) and most-violated Life-Saving Rule per site.

5. **Populates a flagged-reports feed** from ground-truth dataset labels, clearly distinguished
   from live model predictions (field name: ground_truth_sif_potential).

6. **Provides an executive HSSE dashboard** -- weekly trend, SIF donut, site density chart,
   department breakdown, pattern clusters, filterable report table.

---

## How to Run

### Option A -- Offline Demo (No Python Required)

```
frontend/index.html
```

Double-click index.html in Windows Explorer. No server, no Python, no npm.
Runs fully offline using the built-in JS NLP engine and 50 pre-labelled seed reports.

### Option B -- Live ML Backend (Recommended)

**Step 1: Install dependencies**
```bash
cd backend
pip install -r requirements.txt
```

**Step 2: Train the models** (if not already done)
```bash
python train_model.py
```
Saves sif_model.joblib, lsr_model.joblib, and training_metrics.json to backend/data/.

**Step 3: Start the API server**
```bash
uvicorn main:app --reload
```
Server: http://localhost:8000
Swagger UI: http://localhost:8000/docs

**Step 4: Open the dashboard**
```
frontend/index.html
```

The dashboard auto-detects the backend on load (1.5 s AbortController probe to /health).
If reachable: _apiLive = true, live model predictions used.
If not reachable: silent fallback to JS engine -- no error banners, no broken UI.

---

## API Endpoints

| Endpoint             | Method | Description                                        |
|----------------------|--------|----------------------------------------------------|
| GET /health          | GET    | Liveness; model load status + stated limitation    |
| POST /classify       | POST   | Classify a single report (live ML model)           |
| GET /sites           | GET    | Aggregate dataset by site: count, density, top LSR |
| GET /reports/flagged | GET    | Top N ground-truth SIF records from dataset        |

### POST /classify Example

**Request:**
```json
{"text": "Contractor working on energized MCC panel at Duliajan without LOTO. No PTW. Near miss."}
```

**Response:**
```json
{
  "sif_potential": true,
  "sif_score": 58,
  "life_saving_rules": ["Energy Isolation"],
  "precursor_factors": [
    "'without' (signal, weight=0.16)",
    "'energized' (signal, weight=0.14)",
    "'panel' (signal, weight=0.08)"
  ],
  "model_predicted_probability": 0.5801
}
```

### GET /sites Example (top 3)

```json
{
  "sites": [
    {"site": "Nazira",     "total_reports": 392, "sif_count": 123, "density": 0.314, "top_life_saving_rule": "Energy Isolation"},
    {"site": "Guwahati",   "total_reports": 346, "sif_count": 107, "density": 0.309, "top_life_saving_rule": "Energy Isolation"},
    {"site": "Bongaigaon", "total_reports": 359, "sif_count": 111, "density": 0.309, "top_life_saving_rule": "Energy Isolation"}
  ],
  "total_records": 3000
}
```

---

## What is Real ML vs Fallback

| Component         | Live (Backend Running)                                           | Offline Fallback                                 |
|-------------------|------------------------------------------------------------------|--------------------------------------------------|
| SIF classification| TF-IDF (1-2 gram, 1,057 vocab) + Logistic Regression (balanced) | Keyword scoring across 8 weighted SIF categories |
| LSR tagging       | OneVsRest classifier (7 IOGP classes, top-1 label)               | Per-rule keyword dicts, threshold 0.15           |
| Precursor factors | TF-IDF weight x LR coefficient for terms in input               | Human-authored category labels                   |
| Site/flagged data | Aggregated from full 3,000-record dataset.json via API          | Computed from 50 SEED_REPORTS in app.js          |

---

## Honest Limitations

> **These limitations MUST be stated in any demonstration, presentation, or publication
> using accuracy figures from this prototype.**

### (a) Synthetic Training Data -- Inflated Accuracy

The training dataset (dataset.json, 3,000 records) is **SYNTHETIC AND TEMPLATE-BASED**.
It contains approximately **333 unique Report_Text templates** repeated across 3,000 rows
(site and date varied) -- a 9x duplication factor.

Training and evaluation were performed on **DEDUPLICATED TEMPLATES ONLY** (train/test split
on 333 unique texts, not raw rows) to avoid data leakage. Reported metrics:

| Metric                       | Value            |
|------------------------------|------------------|
| SIF Accuracy (held-out)      | **100.00%**      |
| SIF Recall                   | **100.00%**      |
| ROC-AUC                      | **1.0000**       |
| LSR Accuracy                 | **100.00%**      |
| 5-Fold CV Recall (train set) | 99.31% +/- 1.38% |
| Adversarial Stress Test      | 87.5% (8 probes) |

**THESE FIGURES REFLECT TEMPLATE VOCABULARY SEPARATION, NOT REAL-WORLD PERFORMANCE.**

Templates have strongly separable vocabulary:
- SIF: "energized", "fatality", "no isolation", "no PTW", "no LOTO"
- Non-SIF: "minor", "housekeeping", "routine", "no high-energy exposure"

A TF-IDF classifier trivially separates these clean synthetic classes.

**Expected real-world accuracy on free-form field reports: 75-90%.**
This estimate must be validated against genuine OIL HSSE reports before any operational use.

### (b) Life-Saving Rule Mapping Gaps

The source dataset records 13 LSR values. Mapping to 9 official IOGP rules:

| Source Value       | Mapped To IOGP Rule       | Records |
|--------------------|---------------------------|---------|
| Energy Isolation   | Energy Isolation          | 192     |
| Line of Fire       | Line of Fire              | 168     |
| Hot Work           | Hot Work                  | 112     |
| Fire/Explosion     | Hot Work (merged)         | 92      |
| Confined Space     | Confined Space            | 91      |
| Working at Height  | Working at Height         | 64      |
| Driving            | Driving                   | 48      |
| Process Safety     | Energy Isolation (merged) | 46      |
| Lifting Operations | Safe Mechanical Lifting   | 24      |
| Chemical Safety    | Confined Space (merged)   | 24      |
| Stored Pressure    | Energy Isolation (merged) | 19      |
| **Emergency Response** | **UNCLASSIFIED**      | **20**  |
| (non-SIF records)  | (no LSR label)            | 2,100   |

**20 records fell into "Unclassified"** (Emergency Response has no direct IOGP equivalent).

The LSR classifier covers only **7 of the 9 official IOGP rules**. `Work Authorisation` and
`Bypassing Safety Controls` are absent from training and handled only by the JS keyword engine.

### (c) Prototype Build -- Not a Production System

This is a **LOCAL-RUN PROTOTYPE** for demonstration and evaluation only:

- **No authentication** -- API is wide-open (allow_origins=["*"]). Do not expose to a network.
- **No persistent database** -- reports, audit trails, sign-offs are in-memory only.
- **No deployment infrastructure** -- no Docker, no HTTPS, no reverse proxy.
- **No integration with OIL live HSSE platform** -- all data is the synthetic seed dataset.
- **No mobile app** -- desktop browser only.
- **No real-user validation** -- adversarial stress test is not a substitute for HSE SME review.

---

## Non-Goals (Explicitly Confirmed)

The following were intentionally excluded from this prototype scope:

- No authentication or role-based access control (RBAC) for the API
- No persistent relational database (PostgreSQL, SQLite, etc.)
- No cloud deployment (AWS, Azure, GCP, NIC eMaaS)
- No scraping or API access to OIL India real HSSE platform
- No mobile application (Android/iOS)
- No PDF report generation or email alerts
- No real-time streaming ingestion pipeline

---

## Suggested Next Steps for a Real Pilot

1. **Validate on real OIL HSSE text** (Most Critical)
   Collect 200-500 genuine field reports (anonymised), have HSE SME label for SIF and LSR.
   Re-evaluate the model. Expect accuracy to drop to 75-85% range.

2. **Expand and diversify the labeled dataset**
   333 clean templates are too separable. Real reports have abbreviations, regional language
   mixing (Assamese/Hindi), OCR errors, and ambiguous phrasing.
   Target 1,000+ unique real reports before production retraining.

3. **Human-in-the-loop triage (mandatory)**
   Any SIF-Potential flag must be reviewed by a qualified Safety Officer before operational action.
   The model is a prioritisation aid, not a decision maker.
   The Statutory Triage Review sign-off in the dashboard is the correct pattern.

4. **Sentence-transformer fine-tuning**
   Replace the TF-IDF vectoriser with a domain-adapted sentence encoder
   (all-MiniLM-L6-v2 or petroleum-safety fine-tuned BERT) for better generalisation.

5. **Add missing IOGP LSR classes**
   Collect and label Work Authorisation and Bypassing Safety Controls violations,
   retrain LSR classifier to cover all 9 rules.

6. **Retraining pipeline**
   Trigger quarterly or when 500+ new real labeled records are available.
   sif_model_backup.joblib rollback checkpoint is already in place.

7. **Security hardening for pilot deployment**
   JWT authentication, rate limiting, role-based endpoint access, HTTPS via Nginx,
   structured audit logging before any deployment on an OIL internal network.

---

## Project Structure

```
SIH pro 2/
+-- frontend/
|   +-- index.html          <- Open this for demo (works offline via file://)
|   +-- style.css           <- Government portal design system (GIGW/NIC compliant)
|   +-- app.js              <- Inline NLP engine + dashboard logic + API wiring
+-- backend/
|   +-- main.py             <- FastAPI application (single file, v2.0.0)
|   +-- train_model.py      <- Training pipeline (dedup-honest edition)
|   +-- requirements.txt    <- Python dependencies
|   +-- engine/
|   |   +-- preprocessor.py <- Abbreviation expansion + text normalisation
|   +-- data/
|       +-- sif_model.joblib        <- Trained SIF binary classifier (54 KB)
|       +-- lsr_model.joblib        <- Trained LSR multi-class classifier (68 KB)
|       +-- training_metrics.json   <- Full evaluation audit trail
|       +-- sif_model_backup.joblib <- Rollback checkpoint
+-- dataset.json            <- Synthetic seed dataset (3,000 records)
+-- README.md               <- This file
```

---

## Standards & References

- **IOGP Life-Saving Rules** -- International Association of Oil and Gas Producers (Report 459)
- **OISD-GDN-166** -- Oil Industry Safety Directorate, SIF Precursor Triage Guidelines
- **DGMS** -- Directorate General of Mines Safety, Statutory reporting requirements
- **DEKRA SIF Methodology** -- Martin & Black, 2015 (precursor category weights)
- **API RP 754** -- Process Safety Performance Indicators (severity potential logic)
- **GIGW** -- Guidelines for Indian Government Websites (accessibility compliance)

---

## Retraining Policy

| Trigger           | Threshold                                     |
|-------------------|-----------------------------------------------|
| Calendar-based    | Quarterly                                     |
| Volume-based      | >=500 new real labeled records                |
| Performance-based | SIF Recall drops below 95% on validation set  |
| Rollback          | sif_model_backup.joblib auto-saved on retrain |

---

*Oil India Limited · HSSE Digital Intelligence · Smart India Hackathon 2025*
*Prototype v2.0.0-dedup-honest · Built: September 2026*

> **WARNING:** Accuracy figures reflect synthetic template data only.
> Validate on real OIL field reports before any operational use.
