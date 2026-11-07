"""Tests for label cleaning, presence, batching, freeze, promise constraint and Busy logic."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from kitchen_assist.features import BULK_WEIGHT, clean_labels
from kitchen_assist.scheduler import (
    BusyController,
    Scheduler,
    Ticket,
    apply_freeze,
    enforce_promises,
    find_batches,
    presence,
    project_starts,
    rank_by_score,
)

DAY = pd.Timestamp("2026-01-05")


def _orders(ready: list[float], picked: list[float]) -> pd.DataFrame:
    n = len(ready)
    return pd.DataFrame({"store_id": "S1", "date": DAY, "confirmed_s": [0.0] * n, "promised_s": [600.0] * n, "ready_s": ready, "picked_up_s": picked})


# ── label cleaning ────────────────────────────────────────────────────────────
def test_pickup_before_ready_uses_pickup_time():
    df = clean_labels(_orders([900.0, 400.0], [700.0, 500.0]))
    assert df.loc[0, "ready_s"] == 700.0 and df.loc[0, "ready_fixed_from_pickup"]
    assert df.loc[1, "ready_s"] == 400.0 and not df.loc[1, "ready_fixed_from_pickup"]
    assert df.loc[0, "late_label"]  # 700 > 600


def test_bulk_taps_keep_earliest_and_downweight_rest():
    df = clean_labels(_orders([500.0, 501.0, 502.5, 900.0], [2000.0] * 4))
    assert df["sample_weight"].tolist() == [1.0, BULK_WEIGHT, BULK_WEIGHT, 1.0]
    assert df["bulk_tap_flag"].tolist() == [True, True, True, False]


def test_two_close_taps_are_not_a_bulk_tap():
    df = clean_labels(_orders([500.0, 501.0, 800.0], [2000.0] * 3))
    assert (df["sample_weight"] == 1.0).all()


# ── presence ──────────────────────────────────────────────────────────────────
def _t(oid: str, channel: str = "counter", items: list[str] | None = None, **kw) -> Ticket:
    base = dict(placed_s=0.0, promised_s=900.0, items=items or ["burger"])
    base.update(kw)
    return Ticket(order_id=oid, channel=channel, **base)


def test_counter_and_kiosk_present_from_placement():
    assert presence(_t("a", "counter"), 0) == "counter"
    assert presence(_t("b", "kiosk"), 0) == "counter"


def test_dasher_promoted_to_at_door_when_eta_reaches_zero():
    t = _t("d", "doordash", dasher_arrival_s=600.0)
    assert presence(t, 599) == "dasher_en_route"
    assert presence(t, 600) == "dasher_at_door"


def test_mobile_promoted_at_pickup_time_or_phone_nearby():
    t = _t("m", "mobile", scheduled_pickup_s=1200.0)
    assert presence(t, 1000) == "mobile_scheduled"
    assert presence(t, 1200) == "counter"
    assert presence(_t("m2", "mobile", scheduled_pickup_s=1200.0, phone_nearby=True), 100) == "counter"


# ── batching ──────────────────────────────────────────────────────────────────
def test_batching_never_lowers_rank_and_respects_limits():
    rng = np.random.default_rng(0)
    menu = ["fries", "burger", "latte", "cookie"]
    for trial in range(200):
        tickets = [
            _t(f"t{i}", str(rng.choice(["counter", "doordash", "mobile"])), list(rng.choice(menu, size=int(rng.integers(1, 4)))), risk=float(rng.random()), pred_prep_sec=float(rng.uniform(120, 900)), placed_s=float(rng.uniform(0, 600)))
            for i in range(10)
        ]
        order = rank_by_score(tickets, 700)
        before = [r.ticket.order_id for r in order]
        batches = find_batches(order, 700)
        assert [r.ticket.order_id for r in order] == before  # order untouched
        pos = {oid: k for k, oid in enumerate(before)}
        for b in batches:
            assert all(pos[m] > pos[b.leader_id] for m in b.member_ids)  # only pull from LOWER tickets
            from kitchen_assist.data.generate import MENU

            assert b.qty <= MENU[b.item].max_batch
            leader = next(r.ticket for r in order if r.ticket.order_id == b.leader_id)
            for m in b.member_ids:
                mt = next(r.ticket for r in order if r.ticket.order_id == m)
                gap = mt.pred_prep_sec - leader.pred_prep_sec
                assert 0 <= gap <= MENU[b.item].hold_tolerance_sec  # never waits, never sits too long


def test_scheduler_plan_ranks_do_not_change_when_batching():
    tickets = [_t("a", items=["fries"], risk=0.9, pred_prep_sec=300), _t("b", items=["fries"], risk=0.1, pred_prep_sec=400), _t("c", items=["latte"], risk=0.5)]
    plan = Scheduler().plan(100, tickets, staff=2)
    assert [r.ticket.order_id for r in plan.ordered] == [r.ticket.order_id for r in rank_by_score(tickets, 100)]
    assert plan.batches and plan.batches[0].leader_id == "a" and plan.batches[0].member_ids == ["b"]


# ── freeze ────────────────────────────────────────────────────────────────────
def test_freeze_keeps_top5_and_near_start_in_place():
    tickets = [_t(f"t{i}", risk=0.1 * i) for i in range(8)]
    prev = [f"t{i}" for i in range(8)]  # previous plan: t0 first
    new = rank_by_score(tickets, 0)  # new scores put t7 first
    out = [r.ticket.order_id for r in apply_freeze(new, prev, near_start_ids={"t6"})]
    assert out[:5] == prev[:5]  # top 5 frozen
    assert out[6] == "t6"  # about to start: keeps its slot
    assert set(out) == set(prev)


# ── promise constraint ────────────────────────────────────────────────────────
def test_ticket_moves_up_if_it_would_start_after_its_promise():
    a = _t("a", promised_s=2000, est_work_sec=300, risk=0.9)
    b = _t("b", promised_s=2000, est_work_sec=300, risk=0.8)
    c = _t("c", promised_s=400, est_work_sec=300, risk=0.0)  # would start at 600 > 400 if last
    order = rank_by_score([a, b, c], 0)
    assert [r.ticket.order_id for r in order] == ["a", "b", "c"]
    fixed = enforce_promises(order, 0, [0.0])
    ids = [r.ticket.order_id for r in fixed]
    assert ids.index("c") < 2
    starts = project_starts(fixed, 0, [0.0])
    assert all(s <= r.ticket.promised_s for r, s in zip(fixed, starts))


# ── Busy logic ────────────────────────────────────────────────────────────────
def test_busy_escalates_then_deescalates_and_never_throttles_counter():
    bc = BusyController()
    hot = [0.9] * 6 + [0.1] * 4  # 60% at risk
    a = bc.update(0, hot, backlog_minutes=10, staff=3)
    assert a.action == "busy_plus_10" and set(a.effects) == {"doordash", "kiosk"}
    assert bc.update(4 * 60, hot, 10, 3).action == "busy_plus_10"  # not 5 min yet
    p = bc.update(5 * 60, hot, 10, 3)
    assert p.action == "pause_delivery" and p.effects["doordash"] == "paused"
    assert "counter" not in p.effects
    calm = [0.9] + [0.1] * 19  # 5% at risk
    assert bc.update(6 * 60, calm, 10, 3).action == "normal"


def test_busy_triggers_on_backlog_alone():
    bc = BusyController()
    a = bc.update(0, [0.1, 0.2], backlog_minutes=100, staff=2)
    assert a.action == "busy_plus_10"


def test_pause_steps_down_to_busy_when_trigger_clears():
    bc = BusyController()
    hot = [0.9] * 5
    bc.update(0, hot, 10, 3)
    bc.update(300, hot, 10, 3)
    assert bc.state == "pause_delivery"
    mid = [0.9] * 3 + [0.1] * 7  # 30%: no trigger, but not below 10%
    assert bc.update(400, mid, 10, 3).action == "busy_plus_10"
