"""Feature engineering at confirm time + label cleaning.

Everything here uses only what the kitchen would know at the moment a ticket is confirmed:
which tickets are still open (no ready tap yet), what they contain, staffing, and the promise.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from kitchen_assist.data.generate import CHANNELS, MENU, STATIONS

TRAIN_DAYS = 24
BULK_WINDOW_SEC = 3.0
BULK_MIN_TICKETS = 3
BULK_WEIGHT = 0.3

STATION_COUNT_COLS = [f"n_{s}" for s in STATIONS]
IN_PROGRESS_COLS = [f"inprog_{s}" for s in STATIONS]
CHANNEL_COLS = [f"ch_{c}" for c in CHANNELS]
FEATURE_COLS = [
    "open_tickets",
    *IN_PROGRESS_COLS,
    "station_contention",
    "staff_on_shift",
    "equipment_down",
    "hour",
    "weekday",
    "item_count",
    "modifier_count",
    *STATION_COUNT_COLS,
    "total_base_prep_sec",
    *CHANNEL_COLS,
    "slack_sec",
]


# ── label cleaning ────────────────────────────────────────────────────────────
def fix_pickup_before_ready(df: pd.DataFrame) -> pd.DataFrame:
    """If the order was picked up before its ready tap, the tap was late: use the pickup time."""
    df = df.copy()
    bad = df["picked_up_s"] < df["ready_s"]
    df["ready_fixed_from_pickup"] = bad
    df.loc[bad, "ready_s"] = df.loc[bad, "picked_up_s"]
    return df


def downweight_bulk_taps(df: pd.DataFrame) -> pd.DataFrame:
    """Tickets tapped ready together (>=3 at one store within 3s): keep the earliest, weight the rest 0.3."""
    df = df.copy()
    df["sample_weight"] = 1.0
    df["bulk_tap_flag"] = False
    for _, g in df.groupby(["store_id", "date"], sort=False):
        g = g.sort_values("ready_s")
        times = g["ready_s"].to_numpy()
        idx = g.index.to_numpy()
        i = 0
        while i < len(times):
            j = i
            while j + 1 < len(times) and times[j + 1] - times[i] <= BULK_WINDOW_SEC:
                j += 1
            if j - i + 1 >= BULK_MIN_TICKETS:
                df.loc[idx[i + 1 : j + 1], "sample_weight"] = BULK_WEIGHT
                df.loc[idx[i : j + 1], "bulk_tap_flag"] = True
            i = j + 1
    return df


def clean_labels(df: pd.DataFrame) -> pd.DataFrame:
    df = downweight_bulk_taps(fix_pickup_before_ready(df))
    df["prep_sec"] = df["ready_s"] - df["confirmed_s"]
    df["late_label"] = df["ready_s"] > df["promised_s"]
    df["minutes_late"] = (df["ready_s"] - df["promised_s"]) / 60
    return df


# ── load at a point in time ───────────────────────────────────────────────────
def load_at(starts: np.ndarray, ends: np.ndarray, weights: np.ndarray, query: np.ndarray) -> np.ndarray:
    """Sum of weights of intervals [start, end) that contain each query time (excluding ones starting at it)."""
    order_s = np.argsort(starts)
    order_e = np.argsort(ends)
    cum_s = np.concatenate([[0.0], np.cumsum(weights[order_s])])
    cum_e = np.concatenate([[0.0], np.cumsum(weights[order_e])])
    started = cum_s[np.searchsorted(starts[order_s], query, side="left")]
    ended = cum_e[np.searchsorted(ends[order_e], query, side="right")]
    return started - ended


def station_counts(items: list[str]) -> dict[str, int]:
    counts = {s: 0 for s in STATIONS}
    for i in items:
        counts[MENU[i].station] += 1
    return counts


def ticket_static_features(items: list[str], modifiers: list[str], channel: str) -> dict[str, float]:
    """Features that depend only on the ticket itself."""
    counts = station_counts(items)
    out: dict[str, float] = {f"n_{s}": counts[s] for s in STATIONS}
    out["item_count"] = len(items)
    out["modifier_count"] = len(modifiers)
    out["total_base_prep_sec"] = float(sum(MENU[i].base_prep_sec for i in items))
    for c in CHANNELS:
        out[f"ch_{c}"] = float(channel == c)
    return out


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add confirm-time features. Expects cleaned labels (uses observed ready taps for 'open')."""
    df = df.copy()
    static = pd.DataFrame([ticket_static_features(i, m, c) for i, m, c in zip(df["items"], df["modifiers"], df["channel"])], index=df.index)
    df[static.columns] = static
    df["open_tickets"] = 0.0
    for col in IN_PROGRESS_COLS:
        df[col] = 0.0
    for _, g in df.groupby(["store_id", "date"], sort=False):
        s, e, q = g["confirmed_s"].to_numpy(), g["ready_s"].to_numpy(), g["confirmed_s"].to_numpy()
        df.loc[g.index, "open_tickets"] = load_at(s, e, np.ones(len(g)), q)
        for st in STATIONS:
            df.loc[g.index, f"inprog_{st}"] = load_at(s, e, g[f"n_{st}"].to_numpy(dtype=float), q)
    df["station_contention"] = contention(df)
    df["slack_sec"] = df["promised_s"] - df["confirmed_s"]
    df["equipment_down"] = df["equipment_down"].astype(float)
    return df


def contention(df: pd.DataFrame) -> pd.Series:
    """Items already in progress on the stations this ticket needs (the busiest one)."""
    parts = [df[f"inprog_{s}"] * (df[f"n_{s}"] > 0) for s in STATIONS]
    return pd.concat(parts, axis=1).max(axis=1)


def time_split(df: pd.DataFrame, train_days: int = TRAIN_DAYS) -> tuple[pd.DataFrame, pd.DataFrame]:
    return df[df["day_index"] < train_days].copy(), df[df["day_index"] >= train_days].copy()


def prepare(df: pd.DataFrame) -> pd.DataFrame:
    """Clean labels, then build features. The single entry point for training."""
    return build_features(clean_labels(df))
