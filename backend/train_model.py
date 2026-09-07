import argparse, json, shutil, sys
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, classification_report,
    confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

BACKEND_DIR = Path(r"c:\Users\DELL\OneDrive\Desktop\SIH pro 2\backend")
sys.path.insert(0, str(BACKEND_DIR))
from engine.preprocessor import preprocess

MODELS_DIR = BACKEND_DIR / "data"

CANDIDATE_PATHS = [
    BACKEND_DIR.parent / "oil_sif_full_3000.json",
    BACKEND_DIR / "data" / "oil_sif_full_3000.json",
    BACKEND_DIR.parent / "dataset.json",
    BACKEND_DIR.parent / "dataset.xlsx",
    BACKEND_DIR.parent / "dataset.csv",
    BACKEND_DIR / "data" / "dataset.json",
    BACKEND_DIR / "data" / "dataset.xlsx",
    BACKEND_DIR / "data" / "dataset.csv",
    Path(r"C:\Users\DELL\Downloads\oil_sif_full_3000.json"),
    Path(r"C:\Users\DELL\Downloads\OIL_SIF_Mixed_3000_Dataset.xlsx"),
]

# Official 9 IOGP Life-Saving Rules:
# 1. Bypassing Safety Controls
# 2. Confined Space
# 3. Driving
# 4. Energy Isolation
# 5. Hot Work
# 6. Line of Fire
# 7. Safe Mechanical Lifting
# 8. Work Authorisation
# 9. Working at Height

LSR_MAPPING = {
    "Energy Isolation":   "Energy Isolation",
    "Line of Fire":       "Line of Fire",
    "Hot Work":           "Hot Work",
    "Fire/Explosion":     "Hot Work",                  # Mapped to IOGP Hot Work
    "Confined Space":     "Confined Space",
    "Working at Height":  "Working at Height",
    "Driving":            "Driving",
    "Process Safety":     "Energy Isolation",          # Mapped to IOGP Energy Isolation
    "Lifting Operations": "Safe Mechanical Lifting",   # Mapped to IOGP Safe Mechanical Lifting
    "Chemical Safety":    "Confined Space",            # Mapped to IOGP Confined Space
    "Stored Pressure":    "Energy Isolation",          # Mapped to IOGP Energy Isolation
    "Emergency Response": "Unclassified",              # Kept as Unclassified (does not map cleanly)
    "None":               "None",                      # Non-SIF / No LSR
}

SYNTHETIC_DATA_CAVEAT = r"""
+========================================================================+
|                      HONEST ACCURACY CAVEAT                            |
+========================================================================+
| CRITICAL STATED LIMITATION (Must be carried into README / docs):       |
|                                                                        |
| 1. The dataset is SYNTHETIC and TEMPLATE-BASED. Exactly ~333 unique   |
|    Report_Text templates are repeated across 3,000 rows with varied    |
|    metadata (site, date, report ID).                                   |
| 2. Vocabulary between classes is STRONGLY and ARTIFICIALLY separable:  |
|    - SIF templates consistently feature high-energy tokens like        |
|      "energized", "fatality", "no isolation", "scaffolding collapsed", |
|      "crane sling broke", "no standby person", "no SCBA".              |
|    - Non-SIF templates explicitly state "minor", "routine work",       |
|      "no high-energy exposure", "housekeeping", "air conditioning".    |
| 3. Near-100% or 100% evaluation metrics reflect the synthetic purity   |
|    and lexical separation of the seed templates, NOT proven field      |
|    performance on messy, unstructured real-world E&P incident reports. |
| 4. On real operational field text with misspellings, colloquialisms,   |
|    and ambiguous narratives, expected performance will drop to ~75-90%.|
|    Next step: collect 500+ real operational OIL field logs for honest  |
|    empirical validation.                                               |
+========================================================================+
"""

def load_dataset(custom_path=None):
    target_path = None
    if custom_path:
        p = Path(custom_path)
        if not p.exists():
            raise FileNotFoundError(f"Not found: {custom_path}")
        target_path = p
    else:
        for c in CANDIDATE_PATHS:
            if c.exists() and c.stat().st_size > 100:
                target_path = c
                break
    if not target_path:
        raise FileNotFoundError("No dataset found.")
    print(f"\n[DataLoader] Loading from: {target_path} ({target_path.stat().st_size:,} bytes)")
    sfx = target_path.suffix.lower()
    if sfx in (".xlsx", ".xls"):
        df = pd.read_excel(target_path)
    elif sfx == ".csv":
        df = pd.read_csv(target_path)
    else:
        df = pd.read_json(target_path)
    print(f"[DataLoader] Successfully loaded {len(df):,} rows | Columns: {list(df.columns)}")
    return df

def find_col(df, candidates):
    m = {str(c).strip().lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in m:
            return m[c.lower()]
    raise KeyError(f"Column not found among: {candidates}")

def clean_and_dedup(df):
    text_col = find_col(df, ["Report_Text", "text", "description", "narrative"])
    sif_col  = find_col(df, ["SIF_Potential_Bool", "SIF_Potential", "sif_potential", "label"])
    lsr_col  = find_col(df, ["Life_Saving_Rule", "life_saving_rule", "lsr", "rule"])

    print(f"\n[Step 1] Initial dataset size: {len(df):,} raw rows")
    
    # Process SIF target
    raw_sif = df[sif_col]
    if raw_sif.dtype == bool or str(raw_sif.dtype) == "bool":
        df["_sif"] = raw_sif.astype(bool)
    else:
        df["_sif"] = raw_sif.astype(str).str.strip().str.upper().isin(["YES", "TRUE", "1", "Y"])

    # Step 2: LSR mapping
    df["_lsr_raw"] = df[lsr_col].astype(str).str.strip()
    df["_lsr"] = df["_lsr_raw"].map(LSR_MAPPING).fillna("Unclassified")

    unclassified_raw = (df["_lsr"] == "Unclassified").sum()
    none_raw = (df["_lsr"] == "None").sum()

    print("\n[Step 2] Life-Saving Rule (LSR) Mapping to 9 Official IOGP Rules:")
    print(f"  Total raw rows: {len(df):,}")
    print(f"  Rows mapped to 'Unclassified' (Emergency Response): {unclassified_raw:,}")
    print(f"  Rows with No LSR / Non-SIF ('None'):                {none_raw:,}")
    print("\n  Detailed Mapping Breakdown (Raw Counts):")
    for orig, mapped in LSR_MAPPING.items():
        cnt = (df["_lsr_raw"] == orig).sum()
        if cnt > 0:
            print(f"    {orig:<22} -> {mapped:<26} ({cnt:>5,} rows)")

    print(f"\n[Text Preprocessing] Cleaning & expanding domain abbreviations...")
    df["_text_proc"] = [preprocess(str(t)) for t in df[text_col]]
    df["_text_raw"] = df[text_col].astype(str).str.strip()

    # Deduplicate by Report_Text BEFORE splitting
    dup_check = df.groupby("_text_raw")["_sif"].nunique()
    if (dup_check > 1).any():
        print(f"  WARNING: {(dup_check > 1).sum()} templates with conflicting labels - resolving via mode")
        mode_sif = df.groupby("_text_raw")["_sif"].agg(lambda x: x.mode()[0])
        mode_lsr = df.groupby("_text_raw")["_lsr"].agg(lambda x: x.mode()[0])
        mode_proc = df.groupby("_text_raw")["_text_proc"].first()
        dedup = pd.DataFrame({
            "_text_raw": mode_sif.index,
            "_text_proc": mode_proc.values,
            "_sif": mode_sif.values,
            "_lsr": mode_lsr.values
        })
    else:
        dedup = df.drop_duplicates(subset=["_text_raw"])[["_text_raw", "_text_proc", "_sif", "_lsr"]].copy()

    unclassified_dedup = (dedup["_lsr"] == "Unclassified").sum()
    none_dedup = (dedup["_lsr"] == "None").sum()

    print(f"\n[Deduplication Complete]")
    print(f"  Raw Rows          : {len(df):,}")
    print(f"  Unique Templates  : {len(dedup):,} (Deduplication factor: {len(df)/len(dedup):.1f}x)")
    print(f"  SIF=True (Precursors): {dedup['_sif'].sum():,} ({dedup['_sif'].mean()*100:.1f}%)")
    print(f"  SIF=False (Non-SIF)  : {(~dedup['_sif']).sum():,} ({(~dedup['_sif']).mean()*100:.1f}%)")
    print(f"  Unique Templates mapped to 'Unclassified': {unclassified_dedup} templates")
    print(f"  Unique Templates with 'None' (Non-SIF)   : {none_dedup} templates")
    return dedup

def train_sif(dedup):
    print("\n"+"="*72)
    print("  STEP 3 - SIF BINARY CLASSIFIER (TF-IDF + Logistic Regression)")
    print("  Split on UNIQUE TEMPLATES only (75/25 stratified)")
    print("="*72)
    X = dedup["_text_proc"].tolist()
    y = dedup["_sif"].astype(int).values
    X_tr,X_te,y_tr,y_te = train_test_split(X,y,test_size=0.25,random_state=42,stratify=y)
    print(f"  Train: {len(X_tr):,} (SIF:{y_tr.sum()}, Non-SIF:{(1-y_tr).sum()})")
    print(f"  Test:  {len(X_te):,} (SIF:{y_te.sum()}, Non-SIF:{(1-y_te).sum()})")
    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1,2),max_features=12000,sublinear_tf=True,min_df=1)),
        ("clf",   LogisticRegression(C=1.0,class_weight="balanced",max_iter=1000,random_state=42,solver="lbfgs")),
    ])
    cv = StratifiedKFold(n_splits=5,shuffle=True,random_state=42)
    cv_rec = cross_val_score(pipe,X_tr,y_tr,cv=cv,scoring="recall")
    cv_f1  = cross_val_score(pipe,X_tr,y_tr,cv=cv,scoring="f1")
    cv_acc = cross_val_score(pipe,X_tr,y_tr,cv=cv,scoring="accuracy")
    print(f"\n  5-Fold CV (train split):")
    print(f"    Recall   : {cv_rec.mean()*100:.2f}% +/- {cv_rec.std()*100:.2f}%")
    print(f"    F1       : {cv_f1.mean()*100:.2f}% +/- {cv_f1.std()*100:.2f}%")
    print(f"    Accuracy : {cv_acc.mean()*100:.2f}% +/- {cv_acc.std()*100:.2f}%")
    pipe.fit(X_tr,y_tr)
    yp = pipe.predict(X_te)
    yproba = pipe.predict_proba(X_te)[:,1]
    acc = accuracy_score(y_te,yp)
    prec=precision_score(y_te,yp,zero_division=0)
    rec=recall_score(y_te,yp,zero_division=0)
    f1=f1_score(y_te,yp,zero_division=0)
    roc=roc_auc_score(y_te,yproba)
    cm=confusion_matrix(y_te,yp)
    p0=precision_score(y_te,yp,pos_label=0,zero_division=0)
    r0=recall_score(y_te,yp,pos_label=0,zero_division=0)
    f10=f1_score(y_te,yp,pos_label=0,zero_division=0)
    print(f"\n  Held-Out Test ({len(y_te)} unique templates):")
    print(f"    Accuracy        : {acc*100:.2f}%")
    print(f"    SIF Precision   : {prec*100:.2f}%")
    print(f"    SIF Recall      : {rec*100:.2f}%  <- statutory priority")
    print(f"    SIF F1          : {f1*100:.2f}%")
    print(f"    Non-SIF Prec    : {p0*100:.2f}%")
    print(f"    Non-SIF Recall  : {r0*100:.2f}%")
    print(f"    ROC-AUC         : {roc:.4f}")
    print(f"\n  Confusion Matrix (rows=Actual, cols=Predicted):")
    print(f"                  Pred Non-SIF  Pred SIF")
    print(f"    Actual Non-SIF   {cm[0][0]:>6}       {cm[0][1]:>6}   <- False Alarms")
    print(f"    Actual SIF       {cm[1][0]:>6}       {cm[1][1]:>6}   <- True SIF Catches")
    print(f"\n  Per-Class Report:")
    print(classification_report(y_te,yp,target_names=["Non-SIF","SIF"],digits=4))
    pipe.fit(X,y)
    print(f"  [Refit] Refitted on all {len(X):,} unique templates for deployment.")
    return pipe, {
        "split_strategy": f"Dedup 75/25 stratified. {len(dedup):,} unique templates.",
        "unique_templates_total": len(dedup),
        "train_templates": len(X_tr), "test_templates": len(X_te),
        "class_distribution": {"sif_templates":int(y.sum()),"non_sif_templates":int((1-y).sum()),"sif_ratio":round(float(y.mean()),4)},
        "cross_validation_5fold_on_train": {"recall_mean":round(float(cv_rec.mean()),4),"recall_std":round(float(cv_rec.std()),4),"f1_mean":round(float(cv_f1.mean()),4),"f1_std":round(float(cv_f1.std()),4),"accuracy_mean":round(float(cv_acc.mean()),4)},
        "held_out_test_metrics": {"accuracy":round(float(acc),4),"sif_precision":round(float(prec),4),"sif_recall":round(float(rec),4),"sif_f1":round(float(f1),4),"non_sif_precision":round(float(p0),4),"non_sif_recall":round(float(r0),4),"non_sif_f1":round(float(f10),4),"roc_auc":round(float(roc),4),"confusion_matrix":{"true_negatives":int(cm[0][0]),"false_positives":int(cm[0][1]),"false_negatives":int(cm[1][0]),"true_positives":int(cm[1][1])}},
    }

def train_lsr(dedup):
    print("\n"+"="*72)
    print("  STEP 4 - LSR MULTI-CLASS CLASSIFIER (OneVsRest + TF-IDF + LogReg)")
    print("="*72)
    ldf = dedup[dedup["_lsr"].notna()&~dedup["_lsr"].isin(["Unclassified","nan","None",""])].copy()
    print(f"  LSR-labeled templates: {len(ldf):,}")
    counts = ldf["_lsr"].value_counts()
    print("  LSR Class Distribution (after IOGP mapping):")
    for rule,cnt in counts.items():
        bar = "+" * int(cnt/counts.max()*30)
        print(f"    {rule:<30} {cnt:>4}  {bar}")
    if len(ldf)<20:
        print("  Too few samples. Skipping.")
        return None, {"status":"skipped"}
    valid = counts[counts>=5].index.tolist()
    ldf = ldf[ldf["_lsr"].isin(valid)].copy()
    X_l = ldf["_text_proc"].tolist(); y_l = ldf["_lsr"].tolist()
    X_tr,X_te,y_tr,y_te = train_test_split(X_l,y_l,test_size=0.25,random_state=42,stratify=y_l)
    print(f"\n  Train: {len(X_tr):,}   Test: {len(X_te):,}")
    pipe = Pipeline([
        ("tfidf", TfidfVectorizer(ngram_range=(1,2),max_features=8000,sublinear_tf=True,min_df=1)),
        ("clf",   OneVsRestClassifier(LogisticRegression(C=1.0,class_weight="balanced",max_iter=1000,random_state=42,solver="lbfgs"))),
    ])
    pipe.fit(X_tr,y_tr)
    yp = pipe.predict(X_te)
    a = accuracy_score(y_te,yp)
    f = f1_score(y_te,yp,average="weighted",zero_division=0)
    print(f"\n  Held-Out Test ({len(y_te)} templates):")
    print(f"    Accuracy (top-1) : {a*100:.2f}%")
    print(f"    Weighted F1      : {f*100:.2f}%")
    print(f"\n  Per-Class Report:")
    print(classification_report(y_te, yp, digits=4, zero_division=0))
    cm_l = confusion_matrix(y_te, yp, labels=valid)
    print("  LSR Confusion Matrix (rows=Actual, cols=Predicted):")
    # Pretty print confusion matrix
    short_labels = [c[:12] for c in valid]
    header = " " * 22 + " ".join([f"{sl:>12}" for sl in short_labels])
    print(header)
    for idx, true_label in enumerate(valid):
        row_str = " ".join([f"{cm_l[idx][j]:>12}" for j in range(len(valid))])
        print(f"  {true_label:<20} {row_str}")

    pipe.fit(X_l, y_l)
    return pipe, {
        "labeled_templates": len(ldf),
        "train": len(X_tr),
        "test": len(X_te),
        "valid_classes": valid,
        "class_counts": counts.to_dict(),
        "accuracy": round(float(a), 4),
        "weighted_f1": round(float(f), 4),
        "confusion_matrix": {valid[i]: {valid[j]: int(cm_l[i][j]) for j in range(len(valid))} for i in range(len(valid))}
    }

def stress_test(pipe):
    probes = [
        ("contractor wrking on energized panel without loto tag. near miss.", True),
        ("worker slip on oily floor in workshop, knee bruise.", False),
        ("hot work started near hydrocarbon line without ptw or gas test.", True),
        ("person entered confined vessel no standby person no scba.", True),
        ("crane sling broke during 20 ton lift dropped load near workers.", True),
        ("minor dust observed on office air conditioning filter.", False),
        ("earplugs not worn during short visit to quiet store room.", False),
        ("scaffolding collapsed at 8m height. worker fell. no harness.", True),
    ]
    Xs = [preprocess(p[0]) for p in probes]
    ys = [int(p[1]) for p in probes]
    preds = pipe.predict(Xs)
    acc = accuracy_score(ys, preds)
    print(f"\n  Adversarial Stress Test ({len(probes)} noisy probes):")
    for i, (txt, exp) in enumerate(probes):
        ok = "OK" if preds[i] == exp else "FAIL"
        el = "SIF" if exp else "Non-SIF"; pl = "SIF" if preds[i] else "Non-SIF"
        print(f"    {ok} [{el} -> {pl}]  {txt[:68]}")
    print(f"  Stress Test Accuracy: {acc*100:.1f}%")
    return float(acc)

def main(custom_file=None):
    print("\n" + "#" * 72)
    print("  OIL India SIF Precursor Detection - Training Pipeline v2.0.0")
    print("  OISD-GDN-166 | DGMS Statutory Triage | Dedup-Honest Edition")
    print("#" * 72)
    df = load_dataset(custom_file)
    dedup = clean_and_dedup(df)
    sif_pipe, sif_m = train_sif(dedup)
    lsr_pipe, lsr_m = train_lsr(dedup)
    sa = stress_test(sif_pipe)

    # 1. Save in backend/data/ for FastAPI backend
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    sif_path = MODELS_DIR / "sif_model.joblib"
    if sif_path.exists():
        shutil.copyfile(sif_path, MODELS_DIR / "sif_model_backup.joblib")
        print(f"\n  [Backup] sif_model_backup.joblib saved")
    joblib.dump(sif_pipe, sif_path)
    print(f"  [Artifact] sif_model.joblib ({sif_path.stat().st_size:,} bytes)")

    # Save standalone fitted TF-IDF vectorizer
    tfidf_vec = sif_pipe.named_steps["tfidf"]
    tfidf_path = MODELS_DIR / "tfidf_vectorizer.joblib"
    joblib.dump(tfidf_vec, tfidf_path)
    print(f"  [Artifact] tfidf_vectorizer.joblib ({tfidf_path.stat().st_size:,} bytes)")

    if lsr_pipe:
        lp = MODELS_DIR / "lsr_model.joblib"
        joblib.dump(lsr_pipe, lp)
        print(f"  [Artifact] lsr_model.joblib ({lp.stat().st_size:,} bytes)")

    # 2. Also save in root models/ directory for convenience
    root_models = BACKEND_DIR.parent / "models"
    root_models.mkdir(parents=True, exist_ok=True)
    joblib.dump(sif_pipe, root_models / "sif_model.joblib")
    joblib.dump(tfidf_vec, root_models / "tfidf_vectorizer.joblib")
    if lsr_pipe:
        joblib.dump(lsr_pipe, root_models / "lsr_model.joblib")
    print(f"  [Artifacts] Synchronized copies to {root_models}/")

    metrics = {
        "system": "OIL India HSSE SIF Precursor Detection Platform",
        "governance_standard": "OISD-GDN-166 & DGMS Statutory Triage",
        "model_version": "v2.0.0-dedup-honest",
        "pipeline": "TF-IDF(1-2gram,12k)+LogReg(balanced,C=1.0)",
        "training_source": {
            "raw_rows": len(df),
            "unique_templates": len(dedup),
            "dedup_factor": f"{len(df)/len(dedup):.1f}x"
        },
        "lsr_mapping": LSR_MAPPING,
        "sif_classifier": sif_m,
        "lsr_classifier": lsr_m,
        "stress_test_accuracy": round(sa, 4),
        "stated_limitation": (
            "SYNTHETIC TEMPLATE-BASED DATA. Near-100% accuracy reflects clean vocabulary "
            "separation between templates, not proven real-world field performance. Must validate "
            "on 500+ real OIL field reports. Expected real accuracy: 75-90%."
        ),
        "retraining_policy": {
            "trigger_calendar": "Quarterly",
            "trigger_volume": ">=500 new real records",
            "min_sif_recall": 0.95,
            "backup": "sif_model_backup.joblib"
        },
    }
    mp = MODELS_DIR / "training_metrics.json"
    with open(mp, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, default=str)
    print(f"  [Artifact] training_metrics.json saved")

    print("\n" + "#" * 72)
    print("  TRAINING COMPLETE")
    print("#" * 72)
    print(f"  Dataset     : {len(df):,} raw -> {len(dedup):,} unique templates")
    print(f"  SIF Accuracy: {sif_m['held_out_test_metrics']['accuracy']*100:.2f}%")
    print(f"  SIF Recall  : {sif_m['held_out_test_metrics']['sif_recall']*100:.2f}%  (target >=95%)")
    print(f"  ROC-AUC     : {sif_m['held_out_test_metrics']['roc_auc']:.4f}")
    if "accuracy" in lsr_m:
        print(f"  LSR Accuracy: {lsr_m['accuracy']*100:.2f}%  Weighted F1: {lsr_m['weighted_f1']*100:.2f}%")
    print(f"  Stress Test : {sa*100:.1f}%")
    print(SYNTHETIC_DATA_CAVEAT)

if __name__=="__main__":
    p = argparse.ArgumentParser(description="OIL SIF Training Pipeline")
    p.add_argument("--file","-f",default=None,help="Dataset path (.xlsx/.csv/.json)")
    args = p.parse_args()
    main(args.file)
