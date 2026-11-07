"""Discrete-event kitchen simulator + replay harness.

One store-day at a time: tickets arrive at their confirm time, cooks (lanes) pick the next ticket
by policy, stations have limited capacity, and cook times come from the generator's true prep
function (queueing is simulated, so the open-ticket term is 0). Every order keeps its own random
draws, so all policies face exactly the same day.

Policies: oldest_first, promised_first, kitchen_assist.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

import numpy as np
import pandas as pd

from kitchen_assist.data.generate import MENU, STATIONS, refund_probability, true_prep_sec, walkout_probability
from kitchen_assist.features import FEATURE_COLS, IN_PROGRESS_COLS, ticket_static_features
from kitchen_assist.scheduler import Plan, Scheduler, Ticket

POLICIES = ["oldest_first", "promised_first", "kitchen_assist"]
STATION_CAPACITY = {"drinks": 3, "fryer": 2, "grill": 3, "bakery": 3}  # tickets cooking at once per station
EXTRA_LANES = 2  # expo + runner add two more pairs of hands
BATCH_MARGINAL = 0.25  # cooking a batched unit costs 25% of its normal time on the leader ticket
BAG_SEC = 30
TICK_SEC = 60
BUSY_QUOTE_SEC = 600


@dataclass
class SimTicket:
    row: dict[str, Any]
    items: list[str]  # items still to cook on this ticket
    promised_s: float
    dasher_arrival_s: float | None
    status: str = "queued"  # queued | cooking | done
    start_s: float = np.nan
    ready_s: float = np.nan
    batched_items: list[str] = field(default_factory=list)
    quoted_extra: bool = False

    @property
    def order_id(self) -> str:
        return self.row["order_id"]

    @property
    def stations(self) -> set[str]:
        return {MENU[i].station for i in self.items}


@dataclass
class DayResult:
    policy: str
    tickets: pd.DataFrame
    busy_minutes: float
    declined: int
    plans: list[tuple[float, Plan]] = field(default_factory=list)


Predictor = Callable[[pd.DataFrame], tuple[np.ndarray, np.ndarray]]  # features -> (pred_prep_sec, risk)


class KitchenSim:
    def __init__(self, orders: pd.DataFrame, policy: str, predictor: Predictor | None = None, record_plans: bool = False, start_s: float | None = None, end_s: float | None = None, use_busy: bool = True):
        if policy == "kitchen_assist" and predictor is None:
            raise ValueError("kitchen_assist needs a predictor (Model A + Model B)")
        self.orders = orders.sort_values("confirmed_s").reset_index(drop=True)
        self.policy, self.predictor, self.record_plans, self.use_busy = policy, predictor, record_plans, use_busy
        first = self.orders.iloc[0]
        self.weekday = int(first["weekday"])
        self.staff_by_hour = self.orders.groupby("hour")["staff_on_shift"].agg(lambda s: int(s.mode().iloc[0])).to_dict()
        self.down = (first.get("down_station"), float(first.get("down_start_s") or 0), float(first.get("down_end_s") or 0))
        self.scheduler = Scheduler()
        self.now = float(start_s if start_s is not None else self.orders["confirmed_s"].min())
        self.end_s = end_s
        self.queue: list[SimTicket] = []
        self.cooking: dict[str, SimTicket] = {}
        self.done: list[SimTicket] = []
        self.events: list[tuple[float, int, str]] = []  # (time, seq, order_id) completions
        self.lane_free: list[float] = []
        self.busy_seconds = 0.0
        self.declined = 0
        self.plans: list[tuple[float, Plan]] = []
        self.last_plan: Plan | None = None
        self._seq = 0

    # ── kitchen state helpers ──
    def staff(self, t: float) -> int:
        return int(self.staff_by_hour.get(int(t // 3600), 2))

    def lanes(self, t: float) -> int:
        return self.staff(t) + EXTRA_LANES

    def station_down(self, station: str, t: float) -> bool:
        s, a, b = self.down
        return s == station and a <= t < b

    def station_load(self) -> dict[str, int]:
        load = {s: 0 for s in STATIONS}
        for tk in self.cooking.values():
            for s in tk.stations | {MENU[i].station for i in tk.batched_items}:
                load[s] += 1
        return load

    def can_start(self, tk: SimTicket) -> bool:
        load = self.station_load()
        return all(load[s] < STATION_CAPACITY[s] for s in tk.stations)

    # ── arrivals & completions ──
    def arrive(self, row: dict[str, Any]) -> None:
        dasher = None if pd.isna(row["dasher_arrival_s"]) else float(row["dasher_arrival_s"])
        tk = SimTicket(row=row, items=list(row["items"]), promised_s=float(row["promised_s"]), dasher_arrival_s=dasher)
        effect = self.last_plan.tablet.effects.get(row["channel"]) if (self.last_plan and self.policy == "kitchen_assist" and self.use_busy) else None
        if effect == "paused":
            self.declined += 1
            return
        if effect == "+10 min":  # quoted 10 more minutes; DoorDash dispatches the Dasher later too
            tk.promised_s += BUSY_QUOTE_SEC
            tk.quoted_extra = True
            if tk.dasher_arrival_s is not None:
                tk.dasher_arrival_s += BUSY_QUOTE_SEC
        self.queue.append(tk)

    def complete(self, order_id: str) -> None:
        tk = self.cooking.pop(order_id)
        tk.status, tk.ready_s = "done", self.now
        self.done.append(tk)

    # ── policies ──
    def ordered_queue(self) -> tuple[list[SimTicket], Plan | None]:
        if self.policy == "oldest_first":
            return sorted(self.queue, key=lambda t: t.row["placed_s"]), None
        if self.policy == "promised_first":
            return sorted(self.queue, key=lambda t: t.promised_s), None
        plan = self.make_plan()
        by_id = {t.order_id: t for t in self.queue}
        return [by_id[r.ticket.order_id] for r in plan.ordered], plan

    def live_features(self, tickets: list[SimTicket]) -> pd.DataFrame:
        """Features for queued tickets 'as if confirmed now' (same columns as training)."""
        open_tk = self.queue + list(self.cooking.values())
        totals = {s: 0 for s in STATIONS}
        for t in open_tk:
            for i in t.items + t.batched_items:
                totals[MENU[i].station] += 1
        rows = []
        for tk in tickets:
            f = ticket_static_features(tk.items or tk.row["items"], tk.row["modifiers"], tk.row["channel"])
            own = {s: f[f"n_{s}"] for s in STATIONS}
            for s in STATIONS:
                f[f"inprog_{s}"] = totals[s] - own[s]
            f["station_contention"] = max([f[f"inprog_{s}"] for s in STATIONS if own[s] > 0] or [0])
            f["open_tickets"] = len(open_tk) - 1
            f["staff_on_shift"] = self.staff(self.now)
            f["equipment_down"] = float(any(self.station_down(s, self.now) for s in STATIONS if own[s] > 0))
            f["hour"], f["weekday"] = int(self.now // 3600), self.weekday
            f["slack_sec"] = tk.promised_s - self.now
            rows.append(f)
        return pd.DataFrame(rows, columns=FEATURE_COLS)

    def make_plan(self) -> Plan:
        tickets = []
        if self.queue:
            prep, risk = self.predictor(self.live_features(self.queue))  # type: ignore[misc]
        for k, tk in enumerate(self.queue):
            r = tk.row
            tickets.append(
                Ticket(
                    order_id=tk.order_id, channel=r["channel"], items=tk.items, modifiers=r["modifiers"], placed_s=r["placed_s"], promised_s=tk.promised_s,
                    dasher_arrival_s=tk.dasher_arrival_s, scheduled_pickup_s=None if pd.isna(r["scheduled_pickup_s"]) else float(r["scheduled_pickup_s"]),
                    risk=float(risk[k]), pred_prep_sec=float(prep[k]), est_work_sec=true_prep_sec(tk.items, r["modifiers"], 0, self.staff(self.now), False, 1.0),
                )
            )
        lanes = sorted(self.lane_free)[: self.lanes(self.now)]
        lanes += [self.now] * (self.lanes(self.now) - len(lanes))
        in_prog = sum(max(0.0, t - self.now) for t in self.lane_free) / 60
        plan = self.scheduler.plan(self.now, tickets, self.staff(self.now), lanes, in_prog)
        self.last_plan = plan
        if self.record_plans:
            self.plans.append((self.now, plan))
        return plan

    # ── dispatch ──
    def free_lanes(self) -> int:
        busy = sum(1 for t in self.lane_free if t > self.now)
        return self.lanes(self.now) - busy

    def start(self, tk: SimTicket, plan: Plan | None) -> None:
        r = tk.row
        extra = 0.0
        if plan is not None:  # pull batched units from lower tickets onto this one
            by_id = {t.order_id: t for t in self.queue}
            for b in plan.batches:
                if b.leader_id != tk.order_id:
                    continue
                for mid in b.member_ids:
                    m = by_id.get(mid)
                    if m and b.item in m.items:
                        n = m.items.count(b.item)
                        m.items = [i for i in m.items if i != b.item]
                        tk.batched_items += [b.item] * n
                        extra += BATCH_MARGINAL * MENU[b.item].base_prep_sec * n
                        if not m.items:  # everything on the member was batched: it's done with the leader
                            self._finish_with_leader(m)
        down = any(self.station_down(s, self.now) for s in tk.stations)
        dur = true_prep_sec(tk.items, r["modifiers"], 0, self.staff(self.now), down, float(r["cook_noise"])) + extra
        tk.status, tk.start_s = "cooking", self.now
        self.queue.remove(tk)
        self.cooking[tk.order_id] = tk
        end = self.now + max(30.0, dur)
        self.lane_free = [t for t in self.lane_free if t > self.now] + [end]
        self._seq += 1
        heapq.heappush(self.events, (end, self._seq, tk.order_id))
        for m in list(self.queue):
            if m.status == "riding":
                self.queue.remove(m)
                m.status, m.start_s = "cooking", self.now
                self.cooking[m.order_id] = m
                self._seq += 1
                heapq.heappush(self.events, (end + BAG_SEC, self._seq, m.order_id))

    def _finish_with_leader(self, m: SimTicket) -> None:
        m.status = "riding"

    def dispatch(self) -> None:
        while self.free_lanes() > 0 and self.queue:
            ordered, plan = self.ordered_queue()
            nxt = next((t for t in ordered if t.status == "queued" and self.can_start(t)), None)
            if nxt is None:
                return
            self.start(nxt, plan)

    # ── main loop ──
    def run(self) -> DayResult:
        rows = self.orders.to_dict("records")
        i = 0
        next_tick = self.now
        stop = self.end_s if self.end_s is not None else float("inf")
        while (i < len(rows) or self.queue or self.cooking) and self.now <= stop:
            t_arr = rows[i]["confirmed_s"] if i < len(rows) else np.inf
            t_evt = self.events[0][0] if self.events else np.inf
            t_tick = next_tick if self.policy == "kitchen_assist" else np.inf
            t = min(t_arr, t_evt, t_tick)
            if t == np.inf or t > stop:
                break
            self.track_busy(t)
            self.now = t
            while self.events and self.events[0][0] <= self.now:
                self.complete(heapq.heappop(self.events)[2])
            while i < len(rows) and rows[i]["confirmed_s"] <= self.now:
                self.arrive(rows[i])
                i += 1
            if self.policy == "kitchen_assist" and self.now >= next_tick:
                self.make_plan()
                next_tick = self.now + TICK_SEC
            self.dispatch()
        return DayResult(self.policy, self.outcomes(), self.busy_seconds / 60, self.declined, self.plans)

    def track_busy(self, t: float) -> None:
        if self.use_busy and self.last_plan is not None and self.last_plan.tablet.action != "normal":
            self.busy_seconds += max(0.0, t - self.now)

    # ── outcomes ──
    def outcomes(self) -> pd.DataFrame:
        recs = []
        for tk in self.done:
            r = tk.row
            minutes_late = max(0.0, (tk.ready_s - tk.promised_s) / 60)
            dasher_wait = shelf = 0.0
            if r["channel"] == "doordash":
                arrival = tk.dasher_arrival_s if tk.dasher_arrival_s is not None else tk.promised_s
                dasher_wait = max(0.0, tk.ready_s - arrival)
                shelf = max(0.0, arrival - tk.ready_s)
            elif r["channel"] == "mobile":
                shelf = max(0.0, r["scheduled_pickup_s"] - tk.ready_s) + 30
            else:
                shelf = float(r["pickup_delay_sec"])
            waited = (tk.ready_s - r["placed_s"]) / 60
            walkout = r["channel"] in ("counter", "kiosk") and r["walkout_u"] < walkout_probability(waited)
            recs.append(
                dict(
                    order_id=tk.order_id, store_id=r["store_id"], channel=r["channel"], placed_s=r["placed_s"], promised_s=tk.promised_s, start_s=tk.start_s, ready_s=tk.ready_s,
                    late=tk.ready_s > tk.promised_s, minutes_late=minutes_late, dasher_wait_sec=dasher_wait, shelf_time_sec=shelf,
                    refund=bool(r["refund_u"] < refund_probability(minutes_late, bool(r["missing_item"]))), walkout=bool(walkout), quoted_extra=tk.quoted_extra,
                )
            )
        return pd.DataFrame(recs)


def make_predictor(prep_model: Any, risk_model: Any) -> Predictor:
    from kitchen_assist.models import lateness, prep_time

    def predict(features: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        prep = prep_time.predict_prep(prep_model, features)
        f = features.copy()
        f["pred_prep_sec"] = prep
        f["pred_slack_sec"] = f["slack_sec"] - prep
        return prep, lateness.predict_proba(risk_model, f)

    return predict


def simulate_day(orders: pd.DataFrame, policy: str, predictor: Predictor | None = None, use_busy: bool = True) -> DayResult:
    return KitchenSim(orders, policy, predictor, use_busy=use_busy).run()


def replay(orders: pd.DataFrame, policies: Iterable[str], predictor: Predictor | None) -> dict[str, list[DayResult]]:
    """Run every policy on every store-day in `orders`."""
    out: dict[str, list[DayResult]] = {p: [] for p in policies}
    for _, day in orders.groupby(["store_id", "date"]):
        for p in out:
            out[p].append(simulate_day(day, p, predictor if p == "kitchen_assist" else None))
    return out
