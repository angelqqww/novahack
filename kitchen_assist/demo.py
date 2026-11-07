"""Live-style ranked queue for a 12:15–12:25 lunch rush at one store.

Run:  python -m kitchen_assist.demo
Prints the queue every 30 simulated seconds: rank, order, channel, tier, time elapsed since the order
was placed, risk, score, batch, and the tablet action/message.
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from kitchen_assist.data.generate import START_DATE, STORE_BY_ID, order_rng
from kitchen_assist.models import lateness, prep_time
from kitchen_assist.simulate import KitchenSim, make_predictor

STORE = "S2"
T0, T1 = 12 * 3600 + 15 * 60, 12 * 3600 + 25 * 60
COLOR = sys.stdout.isatty()

# (minute offset from 12:15 when placed, channel, items, modifiers, name)
SCRIPT: list[tuple[float, str, list[str], list[str], str]] = [
    (-9, "counter", ["burger", "fries"], [], "Ana"),
    (-8, "doordash", ["chicken_sandwich", "fries", "iced_tea"], [], "Dasher Ray"),
    (-7, "counter", ["latte", "croissant"], ["oat milk"], "Ben"),
    (-6, "kiosk", ["chicken_tenders", "fries"], [], "Omar · K2"),
    (-6, "mobile", ["burger", "onion_rings"], ["no onion"], "Priya"),
    (-5, "counter", ["grilled_cheese", "smoothie"], [], "Cleo"),
    (-5, "doordash", ["burger", "burger", "fries"], ["extra cheese"], "Dasher Kim"),
    (-4, "kiosk", ["latte", "muffin"], ["extra shot"], "Lena · K1"),
    (-3, "counter", ["chicken_tenders"], [], "Dev"),
    (-3, "mobile", ["latte", "cookie"], [], "Sam"),
    (-2, "doordash", ["fries", "chicken_tenders", "iced_tea"], [], "Dasher Lu"),
    (-2, "counter", ["burger", "fries", "iced_tea"], ["well done"], "Eli"),
    (-1, "kiosk", ["grilled_cheese", "fries"], [], "Raj · K3"),
    (0, "counter", ["smoothie", "croissant"], [], "Fay"),
    (1, "doordash", ["chicken_sandwich", "onion_rings"], [], "Dasher Mo"),
    (2, "counter", ["burger", "fries"], [], "Gus"),
    (1.5, "kiosk", ["burger", "iced_tea"], [], "Mia · K2"),
    (3, "kiosk", ["latte", "latte", "cookie"], [], "Tom · K1"),
    (4.5, "kiosk", ["chicken_sandwich", "fries"], ["no onion"], "Zoe · K3"),
    (4, "counter", ["chicken_sandwich", "fries"], ["sauce on side"], "Hana"),
    (5, "mobile", ["iced_tea", "muffin"], [], "Ivy"),
    (5.5, "kiosk", ["smoothie", "croissant"], [], "Nico · K1"),
    (6, "counter", ["fries", "cookie"], [], "Jo"),
    (7, "kiosk", ["chicken_tenders", "fries"], [], "Kai · K2"),
]


def scenario() -> pd.DataFrame:
    store = STORE_BY_ID[STORE]
    date = START_DATE + pd.Timedelta(days=26)
    rows = []
    for k, (off, ch, items, mods, name) in enumerate(SCRIPT):
        oid = f"#{101 + k}"
        r = order_rng(oid)
        placed = T0 + off * 60
        promised = placed + store.prep_setting_sec + store.buffer_sec
        dasher = promised + float(r.normal(-60, 120)) if ch == "doordash" else np.nan
        sched = placed + 12 * 60 if ch == "mobile" else np.nan
        if ch == "mobile":
            promised = max(promised, sched)
        rows.append(dict(
            order_id=oid, name=name, store_id=STORE, channel=ch, items=items, modifiers=mods, item_count=len(items), date=date, placed_s=placed,
            confirmed_s=placed + 20, promised_s=promised, dasher_arrival_s=dasher, scheduled_pickup_s=sched, staff_on_shift=3, hour=12, weekday=int(date.weekday()),
            equipment_down=False, cook_noise=float(r.lognormal(0, 0.1)), pickup_delay_sec=30.0, missing_item=False, refund_u=float(r.random()), walkout_u=float(r.random()),
            down_station=None, down_start_s=0.0, down_end_s=0.0,
        ))
    return pd.DataFrame(rows)


def clock(s: float) -> str:
    s = int(s)
    return f"{s // 3600 % 12 or 12}:{s // 60 % 60:02d}:{s % 60:02d}"


def mmss(sec: float) -> str:
    sign = "-" if sec < 0 else ""
    sec = abs(int(sec))
    return f"{sign}{sec // 60}:{sec % 60:02d}"


def c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if COLOR else text


TIER_LABEL = {"counter": "IN PERSON", "dasher_at_door": "DASHER @DOOR", "dasher_en_route": "dasher en route", "mobile_scheduled": "mobile (sched)"}


def render(sim: KitchenSim, names: dict[str, str]) -> str:
    plan = sim.last_plan
    out = [c(f"── {clock(sim.now)} ─ queue {len(sim.queue)} · cooking {len(sim.cooking)} · ready {len(sim.done)} " + "─" * 30, "1")]
    if plan is None or not plan.ordered:
        out.append("  (no tickets waiting)")
    else:
        out.append(f"  {'#':>2}  {'order':<5} {'guest':<11} {'channel':<9} {'tier':<15} {'elapsed':>7} {'promise':>7} {'risk':>5} {'score':>5}  batch")
        for r in plan.ordered:
            t = r.ticket
            elapsed = mmss(sim.now - t.placed_s)
            promise = mmss(t.promised_s - sim.now)
            tier = TIER_LABEL[r.tier]
            if r.tier in ("counter", "dasher_at_door"):
                tier = c(f"{tier:<15}", "1;31")
            else:
                tier = f"{tier:<15}"
            risk = f"{min(t.risk, 0.99):>5.0%}"
            if t.risk > 0.6:
                risk = c(risk, "31")
            frozen = "*" if r.frozen else " "
            out.append(f"  {r.rank:>2}{frozen} {t.order_id:<5} {names[t.order_id]:<11} {t.channel:<9} {tier} {elapsed:>7} {promise:>7} {risk} {r.score:>5.2f}  {','.join(r.batch_ids) or '-'}")
        for b in plan.batches:
            out.append(c(f"  {b.batch_id}: cook {b.qty}x {b.item} together — leader {b.leader_id}, with {', '.join(b.member_ids)}", "36"))
    cooking = ", ".join(f"{k} ({mmss(sim.now - v.start_s)} in)" for k, v in sim.cooking.items())
    out.append(f"  cooking: {cooking or '-'}")
    if plan is not None:
        color = {"normal": "32", "busy_plus_10": "33", "pause_delivery": "31"}[plan.tablet.action]
        out.append(c(f"  TABLET: {plan.tablet.action.upper()}", color) + f"  {plan.message}")
    return "\n".join(out)


def main() -> None:
    orders = scenario()
    names = dict(zip(orders["order_id"], orders["name"]))
    predictor = make_predictor(prep_time.load_model(), lateness.load_model())
    print(c("kitchen_assist demo — lunch rush at store S2, 12:15–12:25 (3 staff)", "1"))
    print("elapsed = time since the guest ordered · promise = time left until the promised time (negative = late) · * = frozen (about to start)")
    counts = orders["channel"].value_counts().to_dict()
    print(f"Tickets placed before 12:15 are already in the queue; new ones arrive during the rush. Kiosk guests show their kiosk (K1–K3).")
    print(f"{len(orders)} tickets: " + ", ".join(f"{counts.get(ch, 0)} {ch}" for ch in ["counter", "kiosk", "mobile", "doordash"]) + "\n")
    pre = orders[orders["placed_s"] < T0]
    sim = KitchenSim(orders, "kitchen_assist", predictor, start_s=float(orders["confirmed_s"].min()), end_s=T0)
    sim.run()  # build up the pre-rush queue
    sim.end_s = T1
    t = T0
    rows = orders.to_dict("records")
    while t <= T1:
        sim.now = t
        while sim.events and sim.events[0][0] <= t:
            from heapq import heappop

            sim.complete(heappop(sim.events)[2])
        for r in rows:
            if t - 30 < r["confirmed_s"] <= t and r["placed_s"] >= T0 - 30:
                sim.arrive(r)
        sim.make_plan()
        sim.dispatch()
        sim.make_plan()
        print(render(sim, names))
        print()
        t += 30
    done = sim.outcomes()
    waiting_late = sum(1 for tk in sim.queue + list(sim.cooking.values()) if tk.promised_s < sim.now)
    print(c(f"By 12:25: {len(done)} orders ready ({int(done['late'].sum())} late); {len(sim.queue) + len(sim.cooking)} still open ({waiting_late} past their promise). {len(pre)} tickets were already in at 12:15.", "1"))


if __name__ == "__main__":
    main()
