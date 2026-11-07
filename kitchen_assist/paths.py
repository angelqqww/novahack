"""File locations (all inside the package folder, so nothing leaks elsewhere)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "orders.pkl"
ARTIFACTS = ROOT / "artifacts"
RESULTS = ROOT / "results"
PREP_MODEL = ARTIFACTS / "prep_model.joblib"
RISK_MODEL = ARTIFACTS / "risk_model.joblib"
