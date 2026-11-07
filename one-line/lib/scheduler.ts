// PURE: when should each order start, and why. No store or UI imports.
import type { MenuItem, Order, Priority, Station } from "./types";
import { CONFIG, MIN, type Config } from "./config";

export const PRIORITY_RANK: Record<Priority, number> = { late: 0, start_now: 1, upcoming: 2, hold: 3 };

/** DoorDash: be ready exactly when the dasher walks in. Walk-in: they're standing there → as soon as they ordered. */
export function idealStartAt(order: Pick<Order, "channel" | "createdAt" | "dasherEtaAt">, predictedPrepMin: number): number {
  if (order.channel === "doordash" && order.dasherEtaAt !== undefined) {
    return order.dasherEtaAt - predictedPrepMin * MIN; // predictedPrepMin already includes the pack buffer
  }
  return order.createdAt;
}

export function priorityFor(
  startAt: number,
  idealStart: number,
  now: number,
  cfg: Pick<Config, "lateThresholdMin" | "startNowWindowMin" | "upcomingWindowMin"> = CONFIG,
): Priority {
  if ((now - idealStart) / MIN > cfg.lateThresholdMin) return "late";
  const d = (startAt - now) / MIN;
  if (d <= cfg.startNowWindowMin) return "start_now";
  if (d <= cfg.upcomingWindowMin) return "upcoming";
  return "hold";
}

// ---------------------------------------------------------------- capacity

export type StationNeed = { station: Station; qty: number; durMin: number };
export type Interval = { station: Station; start: number; end: number; qty: number; unitId: string };

export type ScheduleUnit = {
  id: string; // order id or batch id
  desiredAt: number; // earliest allowed start (≥ now)
  urgency: number; // sort key: smaller = allocated first (the ideal start)
  needs: StationNeed[];
  // filled by applyCapacity:
  startAt?: number;
  pushedBackMin?: number;
  blockedBy?: Station;
};

function overlapQty(intervals: Interval[], station: Station, from: number, to: number): number {
  // Peak usage of `station` during [from, to): check at `from` and at every interval start inside.
  const relevant = intervals.filter((i) => i.station === station && i.start < to && i.end > from);
  const points = [from, ...relevant.map((i) => i.start).filter((s) => s > from && s < to)];
  let peak = 0;
  for (const p of points) {
    const q = relevant.filter((i) => i.start <= p && i.end > p).reduce((s, i) => s + i.qty, 0);
    if (q > peak) peak = q;
  }
  return peak;
}

/**
 * Greedy capacity pass. Units are placed most-urgent first at the earliest time ≥ desiredAt
 * where every station they need has room for their whole cooking time.
 * `committed` = items already cooking. Returns placed units and all intervals (for load bars).
 */
export function applyCapacity(
  units: ScheduleUnit[],
  committed: Interval[],
  capacity: Record<Station, number> = CONFIG.stationCapacity,
): { units: ScheduleUnit[]; intervals: Interval[] } {
  const intervals = [...committed];
  const placed: ScheduleUnit[] = [];
  const sorted = [...units].sort((a, b) => a.urgency - b.urgency || a.desiredAt - b.desiredAt || a.id.localeCompare(b.id));
  for (const u of sorted) {
    const needs = u.needs.map((n) => ({ ...n, qty: Math.min(n.qty, capacity[n.station]) }));
    const fits = (t: number) => needs.every((n) => overlapQty(intervals, n.station, t, t + n.durMin * MIN) + n.qty <= capacity[n.station]);
    let t = u.desiredAt;
    let blockedBy: Station | undefined;
    if (!fits(t)) {
      blockedBy = needs.find((n) => overlapQty(intervals, n.station, t, t + n.durMin * MIN) + n.qty > capacity[n.station])?.station;
      const candidates = [...new Set(intervals.map((i) => i.end).filter((e) => e > u.desiredAt))].sort((a, b) => a - b);
      t = candidates.find(fits) ?? candidates[candidates.length - 1] ?? u.desiredAt;
    }
    for (const n of needs) intervals.push({ station: n.station, start: t, end: t + n.durMin * MIN, qty: n.qty, unitId: u.id });
    placed.push({ ...u, startAt: t, pushedBackMin: (t - u.desiredAt) / MIN, blockedBy: t > u.desiredAt ? blockedBy : undefined });
  }
  return { units: placed, intervals };
}

export function stationUsageAt(intervals: Interval[], station: Station, t: number): number {
  return intervals.filter((i) => i.station === station && i.start <= t && i.end > t).reduce((s, i) => s + i.qty, 0);
}

// ---------------------------------------------------------------- reasons

export const fmtMin = (m: number) => (m < 1 ? "<1" : `${Math.round(m)}`);

export type ReasonCtx = {
  order: Pick<Order, "channel" | "dasherName" | "dasherEtaAt" | "createdAt" | "customerName">;
  now: number;
  priority: Priority;
  startAt: number;
  predictedPrepMin: number;
  pushedBackMin?: number;
  blockedBy?: Station;
  lateMin?: number;
  holdItem?: MenuItem; // the order's most fragile item
};

/** Plain-language, template-based explanation for a queued order. */
export function reasonFor(c: ReasonCtx): string {
  const { order, now, priority } = c;
  const isPushed = (c.pushedBackMin ?? 0) >= 0.5;
  const station = c.blockedBy ?? "kitchen";
  const pushed = isPushed ? `Pushed back ${fmtMin(c.pushedBackMin!)} min — ${station} is full.` : "";
  const prep = fmtMin(c.predictedPrepMin);
  const untilStart = (c.startAt - now) / MIN;
  const lateAndFull = `${station} is full; earliest start in ${fmtMin(untilStart)} min.`;

  if (order.channel === "walkin") {
    const waited = (now - order.createdAt) / MIN;
    if (priority === "late") return isPushed ? `Walk-in waiting ${fmtMin(waited)} min — ${lateAndFull}` : `Walk-in waiting ${fmtMin(waited)} min — start now.`;
    if (pushed) return join("Walk-in — customer at counter.", pushed);
    return "Walk-in — customer waiting at counter.";
  }

  const who = order.dasherName ? `dasher ${order.dasherName}` : "dasher";
  const etaMin = ((order.dasherEtaAt ?? now) - now) / MIN;
  const arrives = etaMin <= 0 ? `${who} is already here` : `${who} arrives in ${fmtMin(etaMin)} min`;
  const late = c.lateMin ?? 0;

  if (priority === "late") {
    if (isPushed) return `Running ${fmtMin(late)} min late — ${lateAndFull} Tell ${who}.`;
    return `Running ${fmtMin(late)} min late — ${arrives}${etaMin > 0 ? `, food takes ${prep}` : ""}; prioritize.`;
  }
  if (pushed) {
    const outcome = late >= 0.5 ? `Will be ~${fmtMin(late)} min late for ${who}.` : `Still ready before ${who} arrives.`;
    return join(pushed, outcome);
  }
  if (priority === "start_now") return `Start now — ${arrives}, food takes ${prep}.`;
  if (priority === "upcoming") return `Start in ${fmtMin(untilStart)} min — ${arrives}, food takes ${prep}.`;
  const why = c.holdItem?.holdPhrase ?? "food would sit and lose quality";
  return `Hold ${fmtMin(untilStart)} min — ${who} is ${fmtMin(etaMin)} min away; ${why} if started now.`;
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** Late first, then start_now, upcoming, hold; ties by start time. */
export function sortQueue<T extends Pick<Order, "priority" | "startAt" | "id">>(orders: T[]): T[] {
  return [...orders].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority ?? "hold"] - PRIORITY_RANK[b.priority ?? "hold"] ||
      (a.startAt ?? 0) - (b.startAt ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
