# SIF Precursor Detection System — Build Tasks

## Phase 1: Data & Engine Foundation
- [x] Keyword taxonomies (SIF precursors + LSR keywords) → `backend/data/`
- [x] 50 OIL-specific synthetic seed reports → `backend/data/seed_data.py`
- [x] Abbreviation dictionary → `backend/data/abbreviations.json`

## Phase 2: Python Backend
- [x] Preprocessor → `backend/engine/preprocessor.py`
- [x] SIF Classifier → `backend/engine/sif_classifier.py`
- [x] LSR Tagger → `backend/engine/lsr_tagger.py`
- [x] Cluster Engine → `backend/engine/cluster_engine.py`
- [x] Explainer → `backend/engine/explainer.py`
- [x] API schemas → `backend/api/schemas.py`
- [x] API routes → `backend/api/routes.py`
- [x] FastAPI main → `backend/main.py`
- [x] Requirements → `backend/requirements.txt`

## Phase 3: Frontend Dashboard
- [x] HTML structure → `frontend/index.html`
- [x] CSS design system → `frontend/style.css`
- [x] Dashboard logic + charts → `frontend/app.js`

## Phase 4: Documentation
- [x] README.md with setup + demo guide
