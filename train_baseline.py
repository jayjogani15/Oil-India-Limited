"""
OIL India SIF Dataset Preparation & Baseline Model Training Script
==================================================================
Input file: oil_sif_full_3000.json

Executes the end-to-end ML pipeline:
1. Loads and validates raw 3,000 incident reports.
2. Maps 13 Life-Saving Rule categories to 9 official IOGP Life-Saving Rules.
   Logs rows mapped to 'Unclassified'.
3. Deduplicates on Report_Text before splitting (333 unique templates).
4. Trains SIF binary classifier (TF-IDF 1-2 grams + Logistic Regression)
   with 75/25 stratified split on deduplicated templates.
5. Trains multi-class/multi-label IOGP Life-Saving Rule classifier
   (OneVsRestClassifier + Logistic Regression) on mapped rules.
6. Reports honest metrics: accuracy, precision/recall/F1 per class, confusion matrices,
   and explicitly prints the synthetic dataset caveat.
7. Saves fitted TF-IDF vectorizer and trained models via joblib.
"""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from train_model import main

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="OIL SIF Baseline Model Training")
    parser.add_argument("--file", "-f", default=str(ROOT_DIR / "oil_sif_full_3000.json"),
                        help="Path to oil_sif_full_3000.json")
    args = parser.parse_args()
    main(args.file)
