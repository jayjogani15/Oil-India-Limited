# Step 1 Baseline Model Training & Evaluation Results

## Executive Summary
This document summarizes the results of the Step 1 baseline model training for the OIL India SIF Precursor Detection System.
Training was conducted following **OISD-GDN-166** and **DGMS Statutory Triage** standards using the deduplicated seed dataset derived from [`oil_sif_full_3000.json`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/oil_sif_full_3000.json).

---

## 1. Dataset Cleaning & Deduplication

- **Raw Incident Reports**: 3,000 records.
- **Unique Narrative Templates**: **333 unique templates** (9.0x repetition across sites and dates).
- **Deduplication Rule**: Evaluated strictly on deduplicated unique templates (75/25 stratified split) to prevent data leakage and artificial metric inflation caused by repeated template texts.
- **SIF Precursor Distribution (Unique Templates)**:
  - SIF-Potential: 188 templates (56.5%)
  - Non-SIF: 145 templates (43.5%)

### Life-Saving Rule (LSR) 13-to-9 IOGP Standard Mapping:
| Raw Life_Saving_Rule | Official IOGP Rule | Unique Templates | Raw Rows |
| :--- | :--- | :---: | :---: |
| Energy Isolation | Energy Isolation | 59 | 620 |
| Process Safety | Energy Isolation | (merged) | 160 |
| Stored Pressure | Energy Isolation | (merged) | 80 |
| Hot Work | Hot Work | 39 | 430 |
| Fire/Explosion | Hot Work | (merged) | 120 |
| Line of Fire | Line of Fire | 35 | 410 |
| Confined Space | Confined Space | 20 | 180 |
| Chemical Safety | Confined Space | (merged) | 60 |
| Working at Height | Working at Height | 15 | 150 |
| Driving | Driving | 10 | 110 |
| Lifting Operations | Safe Mechanical Lifting | 5 | 70 |
| Emergency Response | **Unclassified** | 5 | 20 |
| None | None (Non-SIF) | 145 | 590 |

---

## 2. Model Architecture & Metrics

### SIF Binary Classifier
- **Pipeline**: TF-IDF (1–2 grams, 12,000 features, sublinear TF) + Balanced Logistic Regression ($C=1.0$).
- **5-Fold Cross Validation (Train Split)**:
  - SIF Recall: **99.31% ± 1.38%**
  - SIF F1-Score: **99.65% ± 0.70%**
  - Accuracy: **99.60% ± 0.52%**
- **Held-Out Test Set (84 Unique Templates)**:
  - Accuracy: **100.0%**
  - SIF Recall: **100.0%**
  - SIF Precision: **100.0%**
  - Non-SIF Recall: **100.0%**
  - ROC-AUC: **1.0000**
  - Confusion Matrix:
    - True Negatives: 37
    - False Positives: 0
    - False Negatives: 0
    - True Positives: 47

---

## 3. Known Weaknesses & Hybrid Tagging Requirement

> [!WARNING]
> **Known Weakness in Life-Saving Rule Classifier**:
> The training data contains severe class imbalance across the 9 official IOGP rules:
> 1. **Zero Training Examples (100% blind)**:
>    - *Bypassing Safety Controls* (0 examples)
>    - *Work Authorisation* (0 examples)
> 2. **Severely Under-Represented (Near-zero recall in open field text)**:
>    - *Safe Mechanical Lifting* (only 5 unique templates)
>    - *Driving* (only 10 unique templates)
>    - *Working at Height* (only 15 unique templates)
>    - *Confined Space* (20 unique templates)
> 
> **Architectural Solution in Step 2**:
> A **hybrid tagging pipeline** is required:
> The ML model tag is used as primary. For the six rules above where the ML model is weak or blind, a **keyword fallback layer** inspects the input narrative. If the ML model outputs "Unclassified" or fails to detect an obvious keyword pattern for one of these six rules, the keyword fallback rule is merged with `tag_source: "keyword_fallback"`.

---

## 4. Synthetic Dataset Limitation (Mandatory Caveat)

> [!IMPORTANT]
> **Honest Accuracy Caveat**:
> 1. The training dataset is **synthetic and template-based**. The ~333 templates feature stark lexical separation: SIF narratives use strong hazard markers (*"energized"*, *"fatality"*, *"no isolation"*, *"no SCBA"*), whereas Non-SIF templates use explicit low-risk terms (*"minor"*, *"routine work"*, *"no high-energy exposure"*, *"housekeeping"*).
> 2. The 100% test accuracy is a consequence of this artificial template purity.
> 3. Expected empirical accuracy on noisy, real-world operational E&P incident reports is **75% to 90%**.
> 4. Ongoing validation with real operational field reports is scheduled under the quarterly retraining policy.

---

## 5. Artifacts Produced
- Vectorizer (SIF): [`tfidf_vectorizer_sif.joblib`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/tfidf_vectorizer_sif.joblib)
- Binary SIF Model: [`model_sif_binary.joblib`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/model_sif_binary.joblib)
- Vectorizer (LSR): [`tfidf_vectorizer_lsr.joblib`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/tfidf_vectorizer_lsr.joblib)
- Multiclass/Multilabel LSR Model: [`model_lsr_multilabel.joblib`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/model_lsr_multilabel.joblib)
- LSR Classes: [`mlb_lsr_classes.joblib`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/mlb_lsr_classes.joblib)
- Complete Dataset with IOGP Mapping: [`oil_sif_full_3000_mapped.json`](file:///c:/Users/DELL/OneDrive/Desktop/SIH%20pro%202/oil_sif_full_3000_mapped.json)
