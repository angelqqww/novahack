"""Model A: predict prep_sec (confirm -> ready) at confirm time.

Run:  python -m kitchen_assist.models.prep_time
Time split: first 24 days train, last 6 test. Reports MAE (minutes) vs two baselines.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np
import pandas as pd

from kitchen_assist.data.generate import load_or_generate
from kitchen_assist.features import FEATURE_COLS, prepare, time_split
from kitchen_assist.models import HAS_LIGHTGBM, feature_importance, make_regressor
from kitchen_assist.paths import ARTIFACTS, PREP_MODEL


@dataclass
class PrepReport:
    mae_model_min: float
    mae_store_setting_min: float
    mae_item_mean_min: float
    n_test: int
    importance: dict[str, float]
    engine: str


def mae_minutes(y: np.ndarray, pred: np.ndarray, w: np.ndarray | None = None) -> float:
    return float(np.average(np.abs(y - pred), weights=w) / 60)


def fit(train: pd.DataFrame) -> Any:
    model = make_regressor()
    model.fit(train[FEATURE_COLS], train["prep_sec"], sample_weight=train["sample_weight"])
    return model


def item_mean_baseline(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    """Per-item historical mean: average prep of past tickets containing each item, averaged over the ticket's items."""
    exploded = train[["items", "prep_sec"]].explode("items")
    means = exploded.groupby("items")["prep_sec"].mean().to_dict()
    overall = float(train["prep_sec"].mean())
    return np.array([np.mean([means.get(i, overall) for i in items]) for items in test["items"]])


def predict_prep(model: Any, features: pd.DataFrame) -> np.ndarray:
    return np.clip(model.predict(features[FEATURE_COLS]), 30, None)


def evaluate(model: Any, train: pd.DataFrame, test: pd.DataFrame) -> PrepReport:
    y = test["prep_sec"].to_numpy()
    w = test["sample_weight"].to_numpy()
    return PrepReport(
        mae_model_min=mae_minutes(y, predict_prep(model, test), w),
        mae_store_setting_min=mae_minutes(y, test["store_prep_setting_sec"].to_numpy(dtype=float), w),
        mae_item_mean_min=mae_minutes(y, item_mean_baseline(train, test), w),
        n_test=len(test),
        importance=feature_importance(model, FEATURE_COLS),
        engine="LightGBM" if HAS_LIGHTGBM else "sklearn HistGradientBoosting",
    )


def train_and_save(df: pd.DataFrame | None = None) -> tuple[Any, PrepReport]:
    data = prepare(df if df is not None else load_or_generate())
    train, test = time_split(data)
    model = fit(train)
    report = evaluate(model, train, test)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, PREP_MODEL)
    pd.Series(report.importance, name="importance").to_csv(ARTIFACTS / "prep_feature_importance.csv")
    return model, report


def load_model() -> Any:
    if not PREP_MODEL.exists():
        return train_and_save()[0]
    return joblib.load(PREP_MODEL)


def format_report(r: PrepReport) -> str:
    top = ", ".join(f"{k} {v:.0%}" for k, v in list(r.importance.items())[:5])
    return "\n".join(
        [
            f"Model A — prep time ({r.engine}), test = last 6 days, n = {r.n_test:,}",
            f"  MAE  model:                 {r.mae_model_min:5.2f} min",
            f"  MAE  store prep setting:    {r.mae_store_setting_min:5.2f} min",
            f"  MAE  per-item hist. mean:   {r.mae_item_mean_min:5.2f} min",
            f"  Top features: {top}",
        ]
    )


def main() -> None:
    _, report = train_and_save()
    print(format_report(report))
    print(f"  Saved {PREP_MODEL} and {ARTIFACTS / 'prep_feature_importance.csv'}")


if __name__ == "__main__":
    main()
