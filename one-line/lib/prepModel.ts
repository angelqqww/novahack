// PURE module: no store or UI imports.
// "Learned prep time": per item, prep = (a + b * load) × peakFactor (on Fri/Sat evenings),
// fit by least squares on 30 days of synthetic history, then nudged online.
import type { MenuItem, Order, PrepModel } from "./types";
import { CONFIG } from "./config";
import { gaussian, makeRng, randInt } from "./rng";

export type PrepRecord = {
  menuItemId: string;
  hour: number; // 0–23
  dow: number; // 0 = Sunday … 6 = Saturday
  load: number; // concurrent orders in the kitchen when it started
  actualMin: number;
};

export const isPeak = (hour: number, dow: number) => (dow === 5 || dow === 6) && hour >= 17 && hour <= 21;

/** Synthetic history. Prep grows with load and runs slower on Fri/Sat evenings, with noise. */
export function generateHistory(menu: MenuItem[], seed = CONFIG.historySeed, days = CONFIG.historyDays): PrepRecord[] {
  const rng = makeRng(seed);
  const records: PrepRecord[] = [];
  for (let d = 0; d < days; d++) {
    const dow = d % 7;
    const dayFactor = dow === 5 || dow === 6 ? 1.4 : dow === 0 ? 1.1 : 1;
    for (let hour = 11; hour <= 21; hour++) {
      const hourBase = hour === 12 || hour === 13 ? 10 : hour >= 18 && hour <= 20 ? 12 : 4;
      const ordersThisHour = Math.round(hourBase * dayFactor * (0.7 + 0.6 * rng()));
      for (let o = 0; o < ordersThisHour; o++) {
        const load = Math.max(0, Math.min(16, Math.round(ordersThisHour * 0.55 + gaussian(rng, 0, 1.5))));
        const lines = randInt(rng, 1, 3);
        for (let l = 0; l < lines; l++) {
          const item = menu[Math.floor(rng() * menu.length)];
          const peak = isPeak(hour, dow) ? 1.12 : 1;
          const actual = item.basePrepMin * (1 + 0.05 * load) * peak + gaussian(rng, 0, 0.12 * item.basePrepMin + 0.2);
          records.push({ menuItemId: item.id, hour, dow, load, actualMin: Math.max(0.5, actual) });
        }
      }
    }
  }
  return records;
}

/** Least-squares fit of prep = a + b·load per item (off-peak), then a peak multiplier. */
export function trainModel(history: PrepRecord[], menu: MenuItem[]): PrepModel {
  const items: PrepModel["items"] = {};
  for (const item of menu) {
    const recs = history.filter((r) => r.menuItemId === item.id);
    const off = recs.filter((r) => !isPeak(r.hour, r.dow));
    const fit = linearFit(off.map((r) => r.load), off.map((r) => r.actualMin));
    const a = fit?.a ?? item.basePrepMin;
    const b = Math.max(0, fit?.b ?? 0);
    const peak = recs.filter((r) => isPeak(r.hour, r.dow));
    const ratios = peak.map((r) => r.actualMin / Math.max(0.1, a + b * r.load));
    const peakFactor = ratios.length >= 5 ? median(ratios) : 1;
    items[item.id] = { a, b, peakFactor, n: recs.length };
  }
  return { items, learnedFromOrders: 0, historyRecords: history.length };
}

export type When = { hour: number; dow: number };

export function predictItemMin(model: PrepModel, menuItemId: string, load: number, when?: When): number {
  const m = model.items[menuItemId];
  if (!m) return 5;
  const peak = when && isPeak(when.hour, when.dow) ? m.peakFactor : 1;
  return Math.max(0.5, (m.a + m.b * load) * peak);
}

/** Items cook in parallel across stations, so the slowest item sets the time. Includes the pack buffer. */
export function predictOrderMin(
  model: PrepModel,
  order: Pick<Order, "items">,
  load: number,
  menu: MenuItem[],
  extraPrepMin = 0,
  when?: When,
  packBufferMin = CONFIG.packBufferMin,
): number {
  return predictCookMin(model, order, load, extraPrepMin, when) + packBufferMin;
}

/** Cooking time only (no pack buffer). */
export function predictCookMin(model: PrepModel, order: Pick<Order, "items">, load: number, extraPrepMin = 0, when?: When): number {
  const slowest = Math.max(0, ...order.items.map((i) => predictItemMin(model, i.menuItemId, load, when)));
  return slowest + extraPrepMin;
}

/** The item that sets the order's prep time. */
export function bottleneckItem(model: PrepModel, order: Pick<Order, "items">, load: number, when?: When): string | undefined {
  let best: string | undefined;
  let bestMin = -1;
  for (const i of order.items) {
    const t = predictItemMin(model, i.menuItemId, load, when);
    if (t > bestMin) [best, bestMin] = [i.menuItemId, t];
  }
  return best;
}

/**
 * Online learning: the order was marked ready after `actualMin` (start → ready, incl. packing).
 * Nudge the bottleneck item's intercept toward what really happened (exponential moving average).
 * Returns a NEW model plus a short description of what changed.
 */
export function learnFromOrder(
  model: PrepModel,
  order: Pick<Order, "items">,
  load: number,
  actualMin: number,
  opts: { alpha?: number; maxResidualMin?: number; extraPrepMin?: number; when?: When; packBufferMin?: number } = {},
): { model: PrepModel; itemId?: string; before?: number; after?: number } {
  const alpha = opts.alpha ?? CONFIG.learnAlpha;
  const maxRes = opts.maxResidualMin ?? CONFIG.learnMaxResidualMin;
  const itemId = bottleneckItem(model, order, load, opts.when);
  if (!itemId) return { model };
  const predicted = predictOrderMin(model, order, load, [], opts.extraPrepMin ?? 0, opts.when, opts.packBufferMin);
  const residual = Math.max(-maxRes, Math.min(maxRes, actualMin - predicted));
  const before = predictItemMin(model, itemId, load, opts.when);
  const m = model.items[itemId];
  const updated = { ...m, a: Math.max(0.3, m.a + alpha * residual), n: m.n + 1 };
  const next: PrepModel = {
    ...model,
    items: { ...model.items, [itemId]: updated },
    learnedFromOrders: model.learnedFromOrders + 1,
  };
  return { model: next, itemId, before, after: predictItemMin(next, itemId, load, opts.when) };
}

function linearFit(xs: number[], ys: number[]): { a: number; b: number } | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

function median(v: number[]): number {
  const s = [...v].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
