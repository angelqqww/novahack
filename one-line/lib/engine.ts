// PURE: one call that turns raw orders into the kitchen's plan.
// prep prediction → ideal start → batching → station capacity → priority + reasons → sort.
import type { Batch, MenuItem, NearMiss, Order, ParsedNotes, PrepModel, Station, StationLoad } from "./types";
import { CONFIG, MIN, type Config } from "./config";
import { itemLabel, menuIndex, pluralName } from "./menu";
import { predictItemMin, predictOrderMin, type When } from "./prepModel";
import { findBatches } from "./batching";
import {
  applyCapacity,
  fmtMin,
  idealStartAt,
  priorityFor,
  reasonFor,
  sortQueue,
  stationUsageAt,
  type Interval,
  type ScheduleUnit,
  type StationNeed,
} from "./scheduler";

export type EngineInput = {
  now: number;
  orders: Order[];
  menu: MenuItem[];
  model: PrepModel;
  notes: Record<string, ParsedNotes | undefined>;
  lockedBatches?: Batch[]; // batches already on the station
  cfg?: Config;
};

export type EngineOutput = {
  orders: Order[];
  batches: Batch[];
  nearMisses: NearMiss[];
  stations: StationLoad[];
  load: number;
};

export const STATIONS: Station[] = ["grill", "fryer", "cold", "assembly"];

export function whenOf(t: number): When {
  const d = new Date(t);
  return { hour: d.getUTCHours(), dow: d.getUTCDay() };
}

export function kitchenLoad(orders: Order[]): number {
  return orders.filter((o) => o.status === "queued" || o.status === "cooking").length;
}

export function computeQueue(input: EngineInput): EngineOutput {
  const { now, menu, model, notes } = input;
  const cfg = input.cfg ?? CONFIG;
  const byId = menuIndex(menu);
  const locked = input.lockedBatches ?? [];
  const active = input.orders.filter((o) => o.status !== "picked_up");
  const load = kitchenLoad(active);
  const when = whenOf(now);
  const itemMin = (id: string) => predictItemMin(model, id, load, when);
  const extraOf = (o: Order) => notes[o.id]?.extraPrepMin ?? 0;

  const lockedKeys = new Set(locked.flatMap((b) => b.orderIds.map((id) => `${id}|${b.menuItemId}`)));

  // 1. Prediction + ideal start for queued orders.
  const ideal = new Map<string, number>();
  const work = active.map((o) => {
    const flags = notes[o.id]?.flags ?? o.flags;
    if (o.status !== "queued") {
      const predictedPrepMin = o.predictedPrepMin ?? predictOrderMin(model, o, load, menu, extraOf(o), when, cfg.packBufferMin);
      return { ...o, flags, predictedPrepMin };
    }
    const predictedPrepMin = predictOrderMin(model, o, load, menu, extraOf(o), when, cfg.packBufferMin);
    const start = idealStartAt(o, predictedPrepMin);
    ideal.set(o.id, start);
    return { ...o, flags, predictedPrepMin, startAt: Math.max(start, now) };
  });
  const queued = work.filter((o) => o.status === "queued");

  // 2. Batching (on desired start = max(ideal, now)).
  const found = findBatches(queued, menu, notes, cfg, { exclude: lockedKeys });
  const nearMisses = [...found.nearMisses];

  // 3. Committed station time: cooking orders + locked batches.
  const committed: Interval[] = [];
  for (const o of work.filter((o) => o.status === "cooking" && o.startedAt !== undefined)) {
    for (const line of o.items) {
      if (lockedKeys.has(`${o.id}|${line.menuItemId}`)) continue;
      const item = byId[line.menuItemId];
      if (!item) continue;
      committed.push({ station: item.station, start: o.startedAt!, end: o.startedAt! + (itemMin(item.id) + extraOf(o)) * MIN, qty: line.qty, unitId: o.id });
    }
  }
  for (const b of locked) {
    const item = byId[b.menuItemId];
    const start = b.startedAt ?? b.startAt;
    if (item) committed.push({ station: item.station, start, end: start + itemMin(item.id) * MIN, qty: b.totalQty, unitId: b.id });
  }

  // 4. Units to place: batches + each queued order's remaining (unbatched) items.
  //    If station capacity would push a batch back, the batch is costing someone time:
  //    break it up and cook those portions with their own orders instead.
  const buildUnits = (activeBatches: Batch[]): ScheduleUnit[] => {
    const batchedKeys = new Set(activeBatches.flatMap((b) => b.orderIds.map((id) => `${id}|${b.menuItemId}`)));
    const units: ScheduleUnit[] = [];
    for (const b of activeBatches) {
      const item = byId[b.menuItemId];
      const urgency = Math.min(...b.orderIds.map((id) => ideal.get(id) ?? b.startAt));
      units.push({ id: b.id, desiredAt: b.startAt, urgency, needs: [{ station: item.station, qty: b.totalQty, durMin: itemMin(item.id) }] });
    }
    for (const o of queued) {
      const needs = new Map<Station, StationNeed>();
      for (const line of o.items) {
        const key = `${o.id}|${line.menuItemId}`;
        if (batchedKeys.has(key) || lockedKeys.has(key)) continue;
        const item = byId[line.menuItemId];
        if (!item) continue;
        const n = needs.get(item.station) ?? { station: item.station, qty: 0, durMin: 0 };
        n.qty += line.qty;
        n.durMin = Math.max(n.durMin, itemMin(item.id) + extraOf(o));
        needs.set(item.station, n);
      }
      if (needs.size) units.push({ id: o.id, desiredAt: o.startAt!, urgency: ideal.get(o.id)!, needs: [...needs.values()] });
    }
    return units;
  };
  let newBatches = found.batches;
  let placement = applyCapacity(buildUnits(newBatches), committed, cfg.stationCapacity);
  for (let pass = 0; pass < 3; pass++) {
    const pushedIds = new Set(placement.units.filter((u) => newBatches.some((b) => b.id === u.id) && (u.pushedBackMin ?? 0) >= 0.5).map((u) => u.id));
    if (!pushedIds.size) break;
    for (const b of newBatches.filter((b) => pushedIds.has(b.id))) {
      const u = placement.units.find((x) => x.id === b.id)!;
      nearMisses.push({
        menuItemId: b.menuItemId,
        orderIds: [b.orderIds[0], b.orderIds[b.orderIds.length - 1]],
        gapMin: 0,
        reason: `Not batched: ${b.orderIds.join(", ")} — ${u.blockedBy ?? "station"} has no room for ${itemLabel(byId[b.menuItemId], b.totalQty)} at once; cooking them separately is faster.`,
      });
    }
    newBatches = newBatches.filter((b) => !pushedIds.has(b.id));
    placement = applyCapacity(buildUnits(newBatches), committed, cfg.stationCapacity);
  }
  const { units: placed, intervals } = placement;
  const placedById = new Map(placed.map((u) => [u.id, u]));

  // 5. Final batches with timing.
  const batches: Batch[] = [
    ...locked.map((b) => {
      const item = byId[b.menuItemId];
      const startedAgo = (now - (b.startedAt ?? b.startAt)) / MIN;
      const left = itemMin(b.menuItemId) - startedAgo;
      return {
        ...b,
        reason: `Cooking ${itemLabel(item, b.totalQty)} together for ${b.orderIds.join(", ")} — ${left > 0 ? `done in ~${fmtMin(left)} min` : "done, hold for packing"}.`,
      };
    }),
    ...newBatches.map((b) => {
      const u = placedById.get(b.id)!;
      const d = (u.startAt! - now) / MIN;
      const timing = d <= cfg.startNowWindowMin ? "start now" : `start in ${fmtMin(d)} min`;
      const pushed = (u.pushedBackMin ?? 0) >= 0.5 ? ` Pushed back ${fmtMin(u.pushedBackMin!)} min — ${u.blockedBy} is full.` : "";
      const m = /^(.*?)\.(\s.*)?$/.exec(b.reason);
      const head = m?.[1] ?? b.reason;
      const tail = m?.[2] ?? "";
      return { ...b, startAt: u.startAt!, reason: `${head} — ${timing}.${tail}${pushed}` };
    }),
  ];
  const batchesOf = (orderId: string) => batches.filter((b) => b.orderIds.includes(orderId));

  // 6. Per-order start, priority, reason.
  const out: Order[] = work.map((o) => {
    const mine = batchesOf(o.id);
    const batchFields = { batchId: mine[0]?.id, batchIds: mine.map((b) => b.id) };
    const predicted = o.predictedPrepMin!;
    const etaLeft = o.dasherEtaAt !== undefined ? (o.dasherEtaAt - now) / MIN : undefined;
    const who = o.dasherName ? `Dasher ${o.dasherName}` : "Dasher";

    if (o.status === "cooking") {
      const readyAt = (o.startedAt ?? now) + predicted * MIN;
      const left = (readyAt - now) / MIN;
      const lateMin = o.dasherEtaAt !== undefined ? Math.max(0, (Math.max(readyAt, now) - o.dasherEtaAt) / MIN) : undefined;
      let reason = left > 0 ? `Cooking — ready in ~${fmtMin(left)} min.` : `Cooking — ${fmtMin(-left)} min over estimate.`;
      if (etaLeft !== undefined) reason += etaLeft > 0 ? ` ${who} arrives in ${fmtMin(etaLeft)} min.` : ` ${who} is waiting.`;
      return { ...o, ...batchFields, readyAt, lateMin, reason, priority: undefined };
    }
    if (o.status === "ready") {
      let reason: string;
      if (o.channel === "walkin") reason = `Ready — call ${o.customerName} to the counter.`;
      else reason = `Ready${o.shelf ? ` on shelf ${o.shelf}` : ""} — ${etaLeft !== undefined && etaLeft > 0 ? `${uncap(who)} arrives in ${fmtMin(etaLeft)} min` : `${uncap(who)} is here`}.`;
      return { ...o, ...batchFields, reason, priority: undefined };
    }

    // queued: the order is ready when its slowest unit (own items or a batch it's in) finishes.
    const own = placedById.get(o.id);
    const batchUnits = mine.filter((b) => !b.startedAt).map((b) => placedById.get(b.id)!).filter(Boolean);
    const lockedMine = mine.filter((b) => b.startedAt);
    const unitEnd = (u: ScheduleUnit) => u.startAt! + Math.max(0, ...u.needs.map((n) => n.durMin)) * MIN;
    const ends = [
      ...[own, ...batchUnits].filter((u): u is ScheduleUnit => !!u).map(unitEnd),
      ...lockedMine.map((b) => (b.startedAt ?? now) + itemMin(b.menuItemId) * MIN),
    ];
    const idealStart = ideal.get(o.id)!;
    const desired = o.startAt!; // max(ideal, now)
    const cookMin = predicted - cfg.packBufferMin;
    const cookEnd = Math.max(desired + cookMin * MIN, ...ends);
    const readyAt = cookEnd + cfg.packBufferMin * MIN;
    const virtualStart = readyAt - predicted * MIN;
    const pushedBackMin = Math.max(0, (virtualStart - desired) / MIN);
    const pushedUnit = [own, ...batchUnits].filter((u): u is ScheduleUnit => !!u).sort((a, b) => (b.pushedBackMin ?? 0) - (a.pushedBackMin ?? 0))[0];
    const startAt = pushedBackMin >= 0.5 ? virtualStart : idealStart;
    const rawPriority = priorityFor(startAt, idealStart, now, cfg);
    // A walk-in customer is standing at the counter: never tell staff to "hold" them.
    const priority = o.channel === "walkin" && rawPriority === "hold" ? "upcoming" : rawPriority;
    const lateMin =
      o.channel === "doordash" && o.dasherEtaAt !== undefined
        ? Math.max(0, (readyAt - o.dasherEtaAt) / MIN)
        : Math.max(0, (now - o.createdAt) / MIN);
    const holdItem = o.items
      .map((l) => byId[l.menuItemId])
      .filter(Boolean)
      .sort((a, b) => a.holdMin - b.holdMin)[0];
    let reason = reasonFor({ order: o, now, priority, startAt, predictedPrepMin: predicted, pushedBackMin, blockedBy: pushedUnit?.blockedBy, lateMin, holdItem });
    const extra = extraOf(o);
    if (extra > 0) reason += ` (+${fmtMin(extra)} min for "${o.notes}")`;
    for (const b of mine.filter((b) => !b.startedAt && b.startAt < startAt - 0.5 * MIN)) {
      const others = b.orderIds.filter((id) => id !== o.id).join(", ");
      const d = (b.startAt - now) / MIN;
      reason += ` 🔗 ${pluralName(byId[b.menuItemId])} cook early with ${others} (${d <= cfg.startNowWindowMin ? "now" : `in ${fmtMin(d)} min`}).`;
    }
    if (lockedMine.length) reason += ` ${lockedMine.map((b) => byId[b.menuItemId]?.name).join(", ")} already cooking in a batch.`;
    return { ...o, ...batchFields, startAt, readyAt, priority, reason, lateMin, pushedBackMin: pushedBackMin >= 0.5 ? pushedBackMin : undefined };
  });

  // 7. Station load bars.
  const stations: StationLoad[] = STATIONS.map((s) => ({
    station: s,
    capacity: cfg.stationCapacity[s],
    cookingNow: Math.min(cfg.stationCapacity[s], stationUsageAt(committed, s, now)),
    plannedNow: Math.min(cfg.stationCapacity[s], stationUsageAt(intervals, s, now)),
  }));

  // 8. Sort: queue (late → hold), then cooking (soonest ready), then ready.
  const q = sortQueue(out.filter((o) => o.status === "queued"));
  const cooking = out.filter((o) => o.status === "cooking").sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
  const ready = out.filter((o) => o.status === "ready").sort((a, b) => (a.readyAtActual ?? 0) - (b.readyAtActual ?? 0));

  return { orders: [...q, ...cooking, ...ready], batches, nearMisses, stations, load };
}

const uncap = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
