"""Rule-based scorer, batching and Busy logic.

score = tier_weight + 3.0 * lateness_risk + 0.05 * minutes_waited

Predictions (risk, Model A prep) are passed in on each Ticket, so this module has no
model dependency and is easy to test.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Literal

import numpy as np
import pandas as pd

from kitchen_assist.data.generate import MENU

Tier = Literal["counter", "dasher_at_door", "dasher_en_route", "mobile_scheduled"]
Action = Literal["normal", "busy_plus_10", "pause_delivery"]

TIER_WEIGHTS: dict[str, float] = {"counter": 3.0, "dasher_at_door": 3.0, "dasher_en_route": 2.0, "mobile_scheduled": 1.0}
RISK_WEIGHT = 3.0
WAIT_WEIGHT = 0.05  # per minute waited
FREEZE_TOP = 5
FREEZE_NEAR_START_SEC = 120
BATCH_LEADERS = 8


@dataclass
class Ticket:
    order_id: str
    channel: str  # counter | kiosk | mobile | doordash
    items: list[str]
    placed_s: float
    promised_s: float
    modifiers: list[str] = field(default_factory=list)
    dasher_arrival_s: float | None = None  # DoorDash: when the Dasher arrives
    scheduled_pickup_s: float | None = None  # mobile: scheduled pickup time
    phone_nearby: bool = False  # mobile: customer's phone is near the store
    risk: float = 0.0  # Model B
    pred_prep_sec: float = 300.0  # Model A: seconds from now until ready
    est_work_sec: float = 300.0  # hands-on cook time (for capacity projection)


@dataclass
class Ranked:
    ticket: Ticket
    tier: Tier
    score: float
    minutes_waited: float
    rank: int = 0
    frozen: bool = False
    projected_start_s: float = 0.0
    batch_ids: list[str] = field(default_factory=list)


@dataclass
class Batch:
    batch_id: str
    item: str
    station: str
    leader_id: str
    member_ids: list[str]
    qty: int


@dataclass
class TabletAction:
    action: Action
    effects: dict[str, str]  # channel -> "+10 min" | "paused"; counter never appears
    until_s: float | None
    message: str


@dataclass
class Plan:
    ordered: list[Ranked]
    batches: list[Batch]
    tablet: TabletAction
    message: str


# ── presence & score ──────────────────────────────────────────────────────────
def presence(t: Ticket, now: float) -> Tier:
    """Who is physically waiting? Counter/kiosk are present from placement; Dashers when they arrive;
    mobile customers at their pickup time or when their phone is nearby."""
    if t.channel in ("counter", "kiosk"):
        return "counter"
    if t.channel == "doordash":
        eta = (t.dasher_arrival_s if t.dasher_arrival_s is not None else t.promised_s) - now
        return "dasher_at_door" if eta <= 0 else "dasher_en_route"
    if t.phone_nearby or (t.scheduled_pickup_s is not None and now >= t.scheduled_pickup_s):
        return "counter"
    return "mobile_scheduled"


def score_ticket(t: Ticket, now: float, weights: dict[str, float] = TIER_WEIGHTS) -> Ranked:
    tier = presence(t, now)
    waited = max(0.0, (now - t.placed_s) / 60)
    return Ranked(ticket=t, tier=tier, score=weights[tier] + RISK_WEIGHT * t.risk + WAIT_WEIGHT * waited, minutes_waited=waited)


def rank_by_score(tickets: list[Ticket], now: float, weights: dict[str, float] = TIER_WEIGHTS) -> list[Ranked]:
    ranked = [score_ticket(t, now, weights) for t in tickets]
    return sorted(ranked, key=lambda r: (-r.score, r.ticket.promised_s, r.ticket.order_id))


# ── capacity projection & the promise constraint ──────────────────────────────
def project_starts(order: list[Ranked], now: float, lane_free_s: list[float]) -> list[float]:
    """Greedy: each ticket starts on the earliest free lane."""
    lanes = sorted(max(now, x) for x in lane_free_s) or [now]
    starts = []
    for r in order:
        i = int(np.argmin(lanes))
        starts.append(lanes[i])
        lanes[i] = lanes[i] + r.ticket.est_work_sec
    return starts


def _violations(order: list[Ranked], starts: list[float], now: float) -> int:
    """Tickets that would start after their promise although they still could start on time."""
    return sum(1 for r, s in zip(order, starts) if s > r.ticket.promised_s >= now)


def enforce_promises(order: list[Ranked], now: float, lane_free_s: list[float]) -> list[Ranked]:
    """Hard constraint: never start a ticket after its promise if another order avoids it.
    Moves the late ticket up as little as possible, never past a frozen ticket, and only if
    the total number of promise misses goes down."""
    order = list(order)
    for _ in range(len(order)):
        starts = project_starts(order, now, lane_free_s)
        base = _violations(order, starts, now)
        if base == 0:
            break
        moved = False
        for j, (r, s) in enumerate(zip(order, starts)):
            if r.frozen or not (s > r.ticket.promised_s >= now):
                continue
            for p in range(j - 1, -1, -1):
                if order[p].frozen:
                    break
                cand = order[:p] + [order[j]] + order[p:j] + order[j + 1 :]
                cs = project_starts(cand, now, lane_free_s)
                if cs[p] <= r.ticket.promised_s and _violations(cand, cs, now) < base:
                    order, moved = cand, True
                    break
            if moved:
                break
        if not moved:
            break
    return order


# ── freeze ────────────────────────────────────────────────────────────────────
def apply_freeze(new_order: list[Ranked], prev_ids: list[str], near_start_ids: set[str]) -> list[Ranked]:
    """Top 5 of the previous plan and anything about to start keep their previous positions."""
    by_id = {r.ticket.order_id: r for r in new_order}
    prev_open = [i for i in prev_ids if i in by_id]
    frozen = set(prev_open[:FREEZE_TOP]) | (near_start_ids & set(prev_open))
    rest = iter([r for r in new_order if r.ticket.order_id not in frozen])
    out: list[Ranked] = []
    for pos in range(len(new_order)):
        if pos < len(prev_open) and prev_open[pos] in frozen:
            out.append(replace(by_id[prev_open[pos]], frozen=True))
        else:
            out.append(next(rest))
    return out


# ── batching ──────────────────────────────────────────────────────────────────
def find_batches(order: list[Ranked], now: float) -> list[Batch]:
    """Scan top-down. For each item on a leader ticket, pull the same item from LOWER tickets when the
    member's predicted ready time (Model A) is 0..hold_tolerance after the leader's, within max_batch.
    Batching never changes the order and never makes anyone wait for a partner."""
    used: dict[str, dict[str, int]] = {}  # order_id -> item -> units already batched
    batches: list[Batch] = []
    for li, leader in enumerate(order[:BATCH_LEADERS]):
        lt = leader.ticket
        leader_ready = now + lt.pred_prep_sec
        for item in dict.fromkeys(lt.items):
            free = lt.items.count(item) - used.get(lt.order_id, {}).get(item, 0)
            if free <= 0:
                continue
            spec = MENU[item]
            qty, members = free, []
            for lower in order[li + 1 :]:
                mt = lower.ticket
                units = mt.items.count(item) - used.get(mt.order_id, {}).get(item, 0)
                if units <= 0 or qty + units > spec.max_batch:
                    continue
                gap = (now + mt.pred_prep_sec) - leader_ready
                if 0 <= gap <= spec.hold_tolerance_sec:
                    members.append(mt.order_id)
                    qty += units
                    used.setdefault(mt.order_id, {})[item] = used.get(mt.order_id, {}).get(item, 0) + units
            if members:
                used.setdefault(lt.order_id, {})[item] = used.get(lt.order_id, {}).get(item, 0) + free
                batches.append(Batch(f"B{len(batches) + 1}", item, spec.station, lt.order_id, members, qty))
    return batches


# ── Busy logic ────────────────────────────────────────────────────────────────
@dataclass
class BusyConfig:
    risk_threshold: float = 0.6
    share_trigger: float = 0.40
    share_clear: float = 0.10
    busy_minutes: float = 15
    escalate_after_minutes: float = 5
    capacity_minutes_per_staff: float = 18


@dataclass
class BusyController:
    config: BusyConfig = field(default_factory=BusyConfig)
    state: Action = "normal"
    since_s: float = 0.0
    until_s: float = 0.0

    def update(self, now: float, risks: list[float], backlog_minutes: float, staff: int) -> TabletAction:
        c = self.config
        at_risk = sum(1 for r in risks if r > c.risk_threshold)
        share = at_risk / len(risks) if risks else 0.0
        capacity = staff * c.capacity_minutes_per_staff
        trigger = share > c.share_trigger or backlog_minutes > capacity
        if self.state == "normal" and trigger:
            self._enter("busy_plus_10", now)
        elif self.state == "busy_plus_10":
            if share < c.share_clear:
                self.state = "normal"
            elif trigger and now - self.since_s >= c.escalate_after_minutes * 60:
                self._enter("pause_delivery", now)
            elif not trigger and now >= self.until_s:
                self.state = "normal"
        elif self.state == "pause_delivery":
            if share < c.share_clear:
                self.state = "normal"
            elif not trigger:
                self._enter("busy_plus_10", now)
        return self._action(at_risk, len(risks), backlog_minutes, capacity)

    def _enter(self, state: Action, now: float) -> None:
        self.state, self.since_s, self.until_s = state, now, now + self.config.busy_minutes * 60

    def _action(self, at_risk: int, n: int, backlog: float, capacity: float) -> TabletAction:
        load = f"{at_risk} of {n} tickets at risk, backlog {backlog:.0f} min for {capacity:.0f} min of cook capacity"
        if self.state == "busy_plus_10":
            return TabletAction("busy_plus_10", {"doordash": "+10 min", "kiosk": "+10 min"}, self.until_s, f"BUSY: {load}. DoorDash & kiosk quote +10 min for 15 min. Counter unaffected.")
        if self.state == "pause_delivery":
            return TabletAction("pause_delivery", {"doordash": "paused", "kiosk": "+10 min"}, self.until_s, f"PAUSE DELIVERY: still slammed after 5 min ({load}). Kiosk +10 min. Counter unaffected.")
        return TabletAction("normal", {}, None, f"Normal: {load}.")


# ── the scheduler ─────────────────────────────────────────────────────────────
@dataclass
class Scheduler:
    weights: dict[str, float] = field(default_factory=lambda: dict(TIER_WEIGHTS))
    busy: BusyController = field(default_factory=BusyController)
    prev_ids: list[str] = field(default_factory=list)
    prev_starts: dict[str, float] = field(default_factory=dict)

    def plan(self, now: float, tickets: list[Ticket], staff: int, lane_free_s: list[float] | None = None, in_progress_minutes: float = 0.0) -> Plan:
        lanes = lane_free_s if lane_free_s is not None else [now] * max(1, staff)
        ranked = rank_by_score(tickets, now, self.weights)
        near = {i for i, s in self.prev_starts.items() if s <= now + FREEZE_NEAR_START_SEC}
        ordered = apply_freeze(ranked, self.prev_ids, near) if self.prev_ids else ranked
        ordered = enforce_promises(ordered, now, lanes)
        starts = project_starts(ordered, now, lanes)
        for k, (r, s) in enumerate(zip(ordered, starts)):
            r.rank, r.projected_start_s = k + 1, s
        batches = find_batches(ordered, now)
        for b in batches:
            for r in ordered:
                if r.ticket.order_id == b.leader_id or r.ticket.order_id in b.member_ids:
                    r.batch_ids.append(b.batch_id)
        backlog = in_progress_minutes + sum(t.est_work_sec for t in tickets) / 60
        tablet = self.busy.update(now, [t.risk for t in tickets], backlog, staff)
        self.prev_ids = [r.ticket.order_id for r in ordered]
        self.prev_starts = {r.ticket.order_id: r.projected_start_s for r in ordered}
        return Plan(ordered, batches, tablet, self._message(ordered, batches, tablet))

    @staticmethod
    def _message(ordered: list[Ranked], batches: list[Batch], tablet: TabletAction) -> str:
        if not ordered:
            return f"Queue empty. {tablet.message}"
        top = ordered[0]
        why = {"counter": "guest at the counter", "dasher_at_door": "Dasher at the door", "dasher_en_route": "Dasher en route", "mobile_scheduled": "scheduled pickup"}[top.tier]
        b = f" {len(batches)} batch{'es' if len(batches) != 1 else ''} ready." if batches else ""
        return f"Start {top.ticket.order_id} next ({why}, risk {min(top.ticket.risk, 0.99):.0%}, waited {top.minutes_waited:.0f} min).{b} {tablet.message}"


# ── weight estimation from outcomes ───────────────────────────────────────────
def estimate_tier_weights(df: pd.DataFrame, anchor: str = "counter", anchor_weight: float = 3.0) -> dict[str, float]:
    """How much worse does each extra minute of waiting make things, per tier?
    Fits (refund or walkout) ~ a + b * minutes_waited per tier and scales the slopes so counter = 3.0."""
    tiers = {
        "counter": (df["channel"].isin(["counter", "kiosk"]), (df["true_ready_s"] - df["placed_s"]) / 60, df["refund"] | df["walkout"]),
        "dasher_at_door": (df["channel"] == "doordash", df["dasher_wait_sec"] / 60, df["refund"]),
        "dasher_en_route": (df["channel"] == "doordash", df["minutes_late_true"], df["refund"]),
        "mobile_scheduled": (df["channel"] == "mobile", ((df["true_ready_s"] - df["scheduled_pickup_s"]) / 60).clip(lower=0), df["refund"]),
    }
    slopes: dict[str, float] = {}
    for tier, (mask, wait, bad) in tiers.items():
        x, y = wait[mask].to_numpy(dtype=float), bad[mask].to_numpy(dtype=float)
        slopes[tier] = float(np.polyfit(x, y, 1)[0]) if len(x) > 10 and x.std() > 0 else 0.0
    scale = anchor_weight / max(1e-9, slopes[anchor])
    return {t: round(max(0.0, s * scale), 2) for t, s in slopes.items()}
