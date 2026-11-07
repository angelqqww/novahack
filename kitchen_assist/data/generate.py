"""Synthetic order generator: ~30 days x 3 stores (~20k orders).

Run:  python -m kitchen_assist.data.generate
Writes kitchen_assist/data/orders.pkl (a pandas DataFrame).

Each order carries its own random draws (cook noise, pickup delays, refund dice) so the
simulator can replay the same orders under different policies with common random numbers.
"""
from __future__ import annotations

import zlib
from dataclasses import dataclass

import numpy as np
import pandas as pd

from kitchen_assist.paths import DATA_FILE

SEED = 7
START_DATE = pd.Timestamp("2026-01-05")  # a Monday
N_DAYS = 30
OPEN_HOUR, CLOSE_HOUR = 7, 22
RUSH_WINDOWS = [(11 * 60 + 45, 13 * 60 + 15), (18 * 60, 20 * 60)]  # minutes since midnight
RUSH_MULT = 4.0
CHANNELS = ["counter", "kiosk", "mobile", "doordash"]
CHANNEL_P = [0.30, 0.20, 0.20, 0.30]
STATIONS = ["drinks", "fryer", "grill", "bakery"]
MODIFIERS = ["no onion", "extra cheese", "oat milk", "extra shot", "well done", "sauce on side", "gluten free bun"]
MODIFIER_SEC = 15
PER_OPEN_TICKET_SEC = 40
ONE_STAFF_SEC = 60
EQUIPMENT_DOWN_SEC = 90


@dataclass(frozen=True)
class MenuItem:
    name: str
    station: str
    base_prep_sec: int
    hold_tolerance_sec: int
    max_batch: int
    popularity: float


MENU: dict[str, MenuItem] = {
    m.name: m
    for m in [
        MenuItem("latte", "drinks", 90, 300, 4, 1.4),
        MenuItem("iced_tea", "drinks", 45, 600, 6, 0.9),
        MenuItem("smoothie", "drinks", 120, 240, 3, 0.7),
        MenuItem("fries", "fryer", 210, 180, 4, 1.6),
        MenuItem("chicken_tenders", "fryer", 300, 240, 3, 1.0),
        MenuItem("onion_rings", "fryer", 240, 180, 3, 0.5),
        MenuItem("burger", "grill", 360, 240, 4, 1.5),
        MenuItem("grilled_cheese", "grill", 240, 240, 4, 0.7),
        MenuItem("chicken_sandwich", "grill", 330, 240, 3, 1.1),
        MenuItem("croissant", "bakery", 60, 900, 6, 0.8),
        MenuItem("muffin", "bakery", 45, 900, 6, 0.6),
        MenuItem("cookie", "bakery", 30, 1200, 8, 0.7),
    ]
}
ITEM_NAMES = list(MENU)


@dataclass(frozen=True)
class Store:
    store_id: str
    prep_setting_sec: int  # what the store tells DoorDash / the app
    buffer_sec: int
    base_rate_per_min: float


STORES = [Store("S1", 600, 120, 0.14), Store("S2", 660, 120, 0.16), Store("S3", 720, 120, 0.15)]
STORE_BY_ID = {s.store_id: s for s in STORES}
WEEKDAY_FACTOR = [0.9, 0.95, 1.0, 1.0, 1.1, 1.2, 1.15]  # Mon..Sun


def is_rush(minute_of_day: float) -> bool:
    return any(a <= minute_of_day < b for a, b in RUSH_WINDOWS)


def staff_for(weekday: int, hour: int, rng: np.random.Generator) -> int:
    """Staff on shift: 1 early/late, 2 normally, 3 at rushes (4 on busy weekend rushes); occasional call-outs."""
    if hour < 8 or hour >= 21:
        staff = 1
    elif 11 <= hour < 14 or 18 <= hour < 20:
        staff = 4 if weekday >= 4 and rng.random() < 0.5 else 3
    else:
        staff = 2
    if rng.random() < 0.08:
        staff -= 1
    return int(min(4, max(1, staff)))


def base_work_sec(items: list[str], modifiers: list[str]) -> float:
    """Hands-on cooking time with an idle kitchen: sum of item prep + modifiers."""
    return float(sum(MENU[i].base_prep_sec for i in items) + MODIFIER_SEC * len(modifiers))


def true_prep_sec(items: list[str], modifiers: list[str], open_tickets: int, staff: int, equipment_down: bool, noise: float) -> float:
    """The ground-truth prep time (confirm -> ready) used by the generator and the simulator.

    The simulator models queueing explicitly, so it calls this with open_tickets=0.
    """
    sec = base_work_sec(items, modifiers) + PER_OPEN_TICKET_SEC * open_tickets
    if staff == 1:
        sec += ONE_STAFF_SEC
    if equipment_down:
        sec += EQUIPMENT_DOWN_SEC
    return sec * noise


def refund_probability(minutes_late: float, missing_item: bool) -> float:
    """Refund chance rises with lateness and jumps when an item is missing."""
    p = 0.01 + 0.035 * max(0.0, minutes_late)
    if missing_item:
        p += 0.45
    return float(min(0.95, p))


def walkout_probability(minutes_waited: float) -> float:
    """In-person guests start leaving after ~12 minutes."""
    return float(min(0.6, max(0.0, (minutes_waited - 12.0) * 0.04)))


def order_rng(order_id: str) -> np.random.Generator:
    """Per-order RNG so replays under different policies use the same random draws."""
    return np.random.default_rng(zlib.crc32(order_id.encode()))


def _arrival_minutes(rate: float, rng: np.random.Generator) -> np.ndarray:
    """Non-homogeneous Poisson arrivals over the open hours (thinning)."""
    start, end = OPEN_HOUR * 60, CLOSE_HOUR * 60
    peak = rate * RUSH_MULT
    t, out = float(start), []
    while True:
        t += rng.exponential(1.0 / peak)
        if t >= end:
            return np.array(out)
        if rng.random() < (rate * (RUSH_MULT if is_rush(t) else 1.0)) / peak:
            out.append(t)


def _equipment_window(rng: np.random.Generator) -> tuple[str | None, float, float]:
    """Rare (5% of store-days) equipment outage: station, start minute, end minute."""
    if rng.random() >= 0.05:
        return None, 0.0, 0.0
    start = rng.uniform(9 * 60, 19 * 60)
    return str(rng.choice(STATIONS)), start, start + rng.uniform(60, 180)


def _draw_items(channel: str, rng: np.random.Generator) -> tuple[list[str], list[str]]:
    n = int(min(5, 1 + rng.poisson(1.4 if channel == "doordash" else 1.1)))
    weights = np.array([MENU[i].popularity for i in ITEM_NAMES])
    items = list(rng.choice(ITEM_NAMES, size=n, p=weights / weights.sum()))
    k = int(rng.choice([0, 1, 2], p=[0.55, 0.3, 0.15]))
    mods = list(rng.choice(MODIFIERS, size=k, replace=False)) if k else []
    return [str(i) for i in items], [str(m) for m in mods]


def _simulate_store_day(store: Store, day: int, rng: np.random.Generator, counter: list[int]) -> list[dict]:
    date = START_DATE + pd.Timedelta(days=day)
    weekday = int(date.weekday())
    minutes = _arrival_minutes(store.base_rate_per_min * WEEKDAY_FACTOR[weekday], rng)
    down_station, down_start, down_end = _equipment_window(rng)
    staff_by_hour = {h: staff_for(weekday, h, rng) for h in range(OPEN_HOUR, CLOSE_HOUR)}
    rows: list[dict] = []
    open_ready: list[float] = []  # true ready times (sec of day) of earlier tickets
    for m in minutes:
        counter[0] += 1
        oid = f"{store.store_id}-{counter[0]:06d}"
        orng = order_rng(oid)
        channel = str(rng.choice(CHANNELS, p=CHANNEL_P))
        items, mods = _draw_items(channel, rng)
        placed = m * 60.0
        confirmed = placed + rng.uniform(0, 60)
        hour = int(m // 60)
        staff = staff_by_hour[hour]
        stations = {MENU[i].station for i in items}
        down = down_station in stations and down_start <= m < down_end
        open_tickets = sum(1 for r in open_ready if r > confirmed)
        cook_noise = float(orng.lognormal(0.0, 0.10))
        prep = true_prep_sec(items, mods, open_tickets, staff, down, cook_noise)
        ready = confirmed + prep
        open_ready.append(ready)
        promised = placed + store.prep_setting_sec + store.buffer_sec
        pickup_delay = float(orng.uniform(10, 90))
        dasher_arrival = scheduled = np.nan
        if channel == "doordash":
            dasher_arrival = promised + float(np.clip(orng.normal(0, 180), -300, 600))
            picked = max(ready, dasher_arrival)
        elif channel == "mobile":
            scheduled = placed + float(orng.uniform(10, 25)) * 60
            promised = max(promised, scheduled)  # order-ahead: the promise is the chosen pickup time
            picked = max(ready, scheduled) + float(orng.uniform(0, 60))
        else:
            picked = ready + pickup_delay
        rows.append(
            dict(
                order_id=oid, store_id=store.store_id, channel=channel, items=items, modifiers=mods,
                item_count=len(items), date=date, placed_s=placed, confirmed_s=confirmed, promised_s=promised,
                true_ready_s=ready, picked_up_s=picked, dasher_arrival_s=dasher_arrival, scheduled_pickup_s=scheduled,
                staff_on_shift=staff, equipment_down=bool(down), hour=hour, weekday=weekday,
                store_prep_setting_sec=store.prep_setting_sec, true_prep_sec=prep, open_tickets_true=open_tickets,
                cook_noise=cook_noise, pickup_delay_sec=pickup_delay, missing_item=bool(orng.random() < 0.02),
                refund_u=float(orng.random()), walkout_u=float(orng.random()),
                down_station=down_station, down_start_s=down_start * 60, down_end_s=down_end * 60,
            )
        )
    return rows


def _add_outcomes(df: pd.DataFrame) -> pd.DataFrame:
    """Ground-truth outcomes from the TRUE ready time."""
    late_sec = df["true_ready_s"] - df["promised_s"]
    df["late"] = late_sec > 0
    df["minutes_late_true"] = (late_sec / 60).clip(lower=0)
    is_dd = df["channel"] == "doordash"
    df["dasher_wait_sec"] = np.where(is_dd, (df["true_ready_s"] - df["dasher_arrival_s"]).clip(lower=0), 0.0)
    df["shelf_time_sec"] = (df["picked_up_s"] - df["true_ready_s"]).clip(lower=0)
    p_refund = [refund_probability(ml, mi) for ml, mi in zip(df["minutes_late_true"], df["missing_item"])]
    df["refund"] = df["refund_u"] < np.array(p_refund)
    waited = (df["true_ready_s"] - df["placed_s"]) / 60
    in_person = df["channel"].isin(["counter", "kiosk"])
    df["walkout"] = in_person & (df["walkout_u"] < waited.map(walkout_probability))
    return df


def _inject_label_noise(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """Observed ready taps: 15% tapped 1-6 min late; ~10% tapped in bulk (several tickets within 3s)."""
    obs = df["true_ready_s"].to_numpy().copy()
    late_tap = rng.random(len(df)) < 0.15
    obs[late_tap] += rng.uniform(60, 360, late_tap.sum())
    df["late_tap"] = late_tap
    df["bulk_tap"] = False
    for _, idx in df.sort_values("true_ready_s").groupby(["store_id", "date"]).groups.items():
        idx = list(idx)
        i = 0
        while i < len(idx) - 3:
            if rng.random() < 0.03:  # start a cluster of 3-4 tickets tapped together
                size = int(rng.integers(3, 5))
                group = idx[i : i + size]
                t = max(obs[df.index.get_indexer(group)])
                for g in group:
                    obs[df.index.get_loc(g)] = t + rng.uniform(0, 3)
                df.loc[group, "bulk_tap"] = True
                i += size
            else:
                i += 1
    df["ready_s"] = obs
    return df


def _to_timestamps(df: pd.DataFrame) -> pd.DataFrame:
    for col in ["placed", "confirmed", "promised", "ready", "true_ready", "picked_up", "dasher_arrival", "scheduled_pickup"]:
        df[f"{col}_at"] = df["date"] + pd.to_timedelta(df[f"{col}_s"], unit="s")
    return df


def generate(n_days: int = N_DAYS, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    counter = [0]
    rows: list[dict] = []
    for day in range(n_days):
        for store in STORES:
            rows.extend(_simulate_store_day(store, day, rng, counter))
    df = pd.DataFrame(rows)
    df = _add_outcomes(df)
    df = _inject_label_noise(df, rng)
    df["day_index"] = (df["date"] - START_DATE).dt.days
    return _to_timestamps(df).sort_values(["store_id", "placed_at"]).reset_index(drop=True)


def load_or_generate() -> pd.DataFrame:
    if DATA_FILE.exists():
        return pd.read_pickle(DATA_FILE)
    df = generate()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_pickle(DATA_FILE)
    return df


def main() -> None:
    df = generate()
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    df.to_pickle(DATA_FILE)
    print(f"Generated {len(df):,} orders across {df['store_id'].nunique()} stores x {df['day_index'].nunique()} days -> {DATA_FILE}")
    print(f"  channels: {df['channel'].value_counts(normalize=True).round(2).to_dict()}")
    print(f"  late: {df['late'].mean():.1%}  refunds: {df['refund'].mean():.1%}  late taps: {df['late_tap'].mean():.1%}  bulk taps: {df['bulk_tap'].mean():.1%}")
    print(f"  median prep: {df['true_prep_sec'].median() / 60:.1f} min  (rush: {df.loc[df['placed_s'].map(lambda s: is_rush(s / 60)), 'true_prep_sec'].median() / 60:.1f} min)")


if __name__ == "__main__":
    main()
