"""Model B: probability a ticket will be ready after its promise.

Run:  python -m kitchen_assist.models.lateness
Inputs: Model A's prediction (out-of-fold on the training days, so it isn't leaked),
slack, open tickets, station contention, plus the confirm-time feature set.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, roc_auc_score

from kitchen_assist.data.generate import load_or_generate
from kitchen_assist.features import FEATURE_COLS, prepare, time_split
from kitchen_assist.models import HAS_LIGHTGBM, make_classifier
from kitchen_assist.models import prep_time
from kitchen_assist.paths import ARTIFACTS, RISK_MODEL

RISK_COLS = [*FEATURE_COLS, "pred_prep_sec", "pred_slack_sec"]


@dataclass
class RiskReport:
    auc: float
    brier: float
    base_rate: float
    calibration: pd.DataFrame = field(repr=False)
    n_test: int = 0
    engine: str = ""


def add_prep_prediction(df: pd.DataFrame, prep_model: Any) -> pd.DataFrame:
    df = df.copy()
    df["pred_prep_sec"] = prep_time.predict_prep(prep_model, df)
    df["pred_slack_sec"] = df["slack_sec"] - df["pred_prep_sec"]
    return df


def out_of_fold_prep(train: pd.DataFrame, folds: int = 4) -> pd.DataFrame:
    """Model A predictions on training days from models that never saw those days."""
    train = train.copy()
    days = np.sort(train["day_index"].unique())
    preds = pd.Series(np.nan, index=train.index)
    for chunk in np.array_split(days, folds):
        hold = train["day_index"].isin(chunk)
        model = prep_time.fit(train[~hold])
        preds[hold] = prep_time.predict_prep(model, train[hold])
    train["pred_prep_sec"] = preds.to_numpy()
    train["pred_slack_sec"] = train["slack_sec"] - train["pred_prep_sec"]
    return train


def fit(train_with_pred: pd.DataFrame) -> Any:
    model = make_classifier()
    model.fit(train_with_pred[RISK_COLS], train_with_pred["late_label"].astype(int), sample_weight=train_with_pred["sample_weight"])
    return model


def predict_proba(model: Any, features: pd.DataFrame) -> np.ndarray:
    return model.predict_proba(features[RISK_COLS])[:, 1]


def calibration_table(y: np.ndarray, p: np.ndarray, bins: int = 10) -> pd.DataFrame:
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    rows = []
    for b in range(bins):
        m = idx == b
        rows.append({"bin": f"{edges[b]:.0%}–{edges[b + 1]:.0%}", "n": int(m.sum()), "mean_predicted": float(p[m].mean()) if m.any() else np.nan, "observed_late": float(y[m].mean()) if m.any() else np.nan})
    return pd.DataFrame(rows)


def evaluate(model: Any, test_with_pred: pd.DataFrame) -> RiskReport:
    y = test_with_pred["late_label"].astype(int).to_numpy()
    p = predict_proba(model, test_with_pred)
    return RiskReport(auc=float(roc_auc_score(y, p)), brier=float(brier_score_loss(y, p)), base_rate=float(y.mean()), calibration=calibration_table(y, p), n_test=len(y), engine="LightGBM" if HAS_LIGHTGBM else "sklearn HistGradientBoosting")


def train_and_save(df: pd.DataFrame | None = None, prep_model: Any | None = None) -> tuple[Any, RiskReport]:
    data = prepare(df if df is not None else load_or_generate())
    train, test = time_split(data)
    prep_model = prep_model or prep_time.load_model()
    model = fit(out_of_fold_prep(train))
    report = evaluate(model, add_prep_prediction(test, prep_model))
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, RISK_MODEL)
    report.calibration.to_csv(ARTIFACTS / "risk_calibration.csv", index=False)
    return model, report


def load_model() -> Any:
    if not RISK_MODEL.exists():
        return train_and_save()[0]
    return joblib.load(RISK_MODEL)


_cache: dict[str, Any] = {}


def predict_risk(ticket_features: pd.DataFrame | Mapping[str, float]) -> np.ndarray | float:
    """Probability of being late. Accepts a DataFrame of confirm-time features (or one dict).

    If `pred_prep_sec` is missing it is filled in with Model A.
    """
    if "risk" not in _cache:
        _cache["risk"], _cache["prep"] = load_model(), prep_time.load_model()
    single = isinstance(ticket_features, Mapping)
    df = pd.DataFrame([ticket_features]) if single else ticket_features
    if "pred_prep_sec" not in df:
        df = add_prep_prediction(df, _cache["prep"])
    p = predict_proba(_cache["risk"], df)
    return float(p[0]) if single else p


def format_report(r: RiskReport) -> str:
    lines = [
        f"Model B — lateness risk ({r.engine}), test = last 6 days, n = {r.n_test:,}, base rate {r.base_rate:.1%}",
        f"  AUC {r.auc:.3f}   Brier {r.brier:.3f}",
        "  Calibration (predicted vs observed late):",
        "    bin        n      predicted   observed",
    ]
    for _, row in r.calibration.iterrows():
        if row["n"]:
            lines.append(f"    {row['bin']:<9} {row['n']:>5}    {row['mean_predicted']:>7.1%}    {row['observed_late']:>7.1%}")
    return "\n".join(lines)


def main() -> None:
    _, report = train_and_save()
    print(format_report(report))
    print(f"  Saved {RISK_MODEL}")


if __name__ == "__main__":
    main()
