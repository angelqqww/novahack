"""Gradient boosting factory: LightGBM if installed, else sklearn HistGradientBoosting."""
from __future__ import annotations

from typing import Any

try:  # pragma: no cover - depends on environment
    import lightgbm as lgb

    HAS_LIGHTGBM = True
except Exception:  # pragma: no cover
    HAS_LIGHTGBM = False


def make_regressor(seed: int = 0) -> Any:
    if HAS_LIGHTGBM:
        return lgb.LGBMRegressor(objective="huber", alpha=90.0, n_estimators=600, learning_rate=0.04, num_leaves=31, min_child_samples=30, subsample=0.9, subsample_freq=1, colsample_bytree=0.9, random_state=seed, verbose=-1)
    from sklearn.ensemble import HistGradientBoostingRegressor

    return HistGradientBoostingRegressor(loss="absolute_error", max_iter=500, learning_rate=0.05, random_state=seed)


def make_classifier(seed: int = 0) -> Any:
    if HAS_LIGHTGBM:
        return lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=40, subsample=0.9, subsample_freq=1, colsample_bytree=0.9, random_state=seed, verbose=-1)
    from sklearn.ensemble import HistGradientBoostingClassifier

    return HistGradientBoostingClassifier(max_iter=400, learning_rate=0.04, random_state=seed)


def feature_importance(model: Any, columns: list[str]) -> dict[str, float]:
    imp = getattr(model, "feature_importances_", None)
    if imp is None:
        return {c: 0.0 for c in columns}
    total = float(sum(imp)) or 1.0
    return {c: float(v) / total for c, v in sorted(zip(columns, imp), key=lambda x: -x[1])}
