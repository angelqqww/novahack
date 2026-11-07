// Pure analytics over the order history. No React, no data fetching.
import {
  DAYS,
  DAYS_LONG,
  HOURS,
  INGREDIENTS,
  MENU,
  PAIRINGS,
  STORE,
  addDays,
  mondayIndex,
  toISODate,
  type DayWeather,
  type HourRecord,
  type LiveOrder,
  type MenuItem,
} from "@/data/mock";

export type Ctx = { now: Date; history: HourRecord[]; weather: DayWeather[] };
export type Metric = "orders" | "revenue" | "prep";
export type Range = "4w" | "12w" | "next";

const MENU_BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m])) as Record<string, MenuItem>;
export const menuItem = (id: string) => MENU_BY_ID[id];

// ── formatting helpers ───────────────────────────────────────────────────────
export const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
export const hourShort = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? "a" : "p"}`;
/** "6–8pm", "11am–1pm" */
export function windowLabel(start: number, end: number) {
  const sameHalf = start < 12 === end < 12 || end === 12;
  const s = ((start + 11) % 12) + 1;
  return sameHalf && !(start < 12 && end >= 12) ? `${s}–${hourLabel(end)}` : `${hourLabel(start)}–${hourLabel(end)}`;
}
const plural = (d: number) => `${DAYS_LONG[d]}s`;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
const round = (v: number, dp = 0) => Math.round(v * 10 ** dp) / 10 ** dp;

// ── basic aggregations ───────────────────────────────────────────────────────
export type DayTotal = { date: string; dow: number; orders: number; revenue: number; prepMin: number; rain: boolean; items: Record<string, number> };

export function todayISO(ctx: Ctx) {
  return toISODate(ctx.now);
}

export function dailyTotals(history: HourRecord[]): DayTotal[] {
  const map = new Map<string, DayTotal & { prepW: number }>();
  for (const r of history) {
    let d = map.get(r.date);
    if (!d) {
      d = { date: r.date, dow: r.dow, orders: 0, revenue: 0, prepMin: 0, prepW: 0, rain: r.rain, items: {} };
      map.set(r.date, d);
    }
    d.orders += r.orders;
    d.revenue += r.revenue;
    d.prepW += r.prepMin * r.orders;
    for (const [k, v] of Object.entries(r.items)) d.items[k] = (d.items[k] ?? 0) + v;
  }
  return [...map.values()].map(({ prepW, ...d }) => ({ ...d, prepMin: d.orders ? prepW / d.orders : 0 }));
}

/** Full days only (today excluded), most recent last. */
export function pastDays(ctx: Ctx): DayTotal[] {
  const t = todayISO(ctx);
  return dailyTotals(ctx.history).filter((d) => d.date < t);
}

export function weeksOfData(ctx: Ctx) {
  return Math.floor(pastDays(ctx).length / 7);
}

export function totalOrdersAnalyzed(ctx: Ctx) {
  return ctx.history.reduce((a, r) => a + r.orders, 0);
}

// ── KPIs ─────────────────────────────────────────────────────────────────────
export type Kpi = { id: "orders" | "revenue" | "prep" | "aov"; label: string; value: number; deltaPct: number; goodWhenUp: boolean; spark: number[]; compare: string };

export function kpis(ctx: Ctx): Kpi[] {
  const t = todayISO(ctx);
  const lastWeek = toISODate(addDays(ctx.now, -7));
  const nowH = ctx.now.getHours();
  const frac = ctx.now.getMinutes() / 60;
  const todayRecs = ctx.history.filter((r) => r.date === t);
  // Same weekday last week, up to the same time of day.
  const lwRecs = ctx.history
    .filter((r) => r.date === lastWeek && r.hour <= nowH)
    .map((r) => (r.hour === nowH ? { ...r, orders: r.orders * frac, revenue: r.revenue * frac } : r));
  const sum = (rs: { orders: number; revenue: number }[], k: "orders" | "revenue") => rs.reduce((a, r) => a + r[k], 0);
  const prepAvg = (rs: HourRecord[]) => {
    const o = rs.reduce((a, r) => a + r.orders, 0);
    return o ? rs.reduce((a, r) => a + r.prepMin * r.orders, 0) / o : 0;
  };
  const oT = sum(todayRecs, "orders");
  const oL = sum(lwRecs, "orders");
  const rT = sum(todayRecs, "revenue");
  const rL = sum(lwRecs, "revenue");
  const pT = prepAvg(todayRecs);
  const pL = prepAvg(ctx.history.filter((r) => r.date === lastWeek && r.hour <= nowH));
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const days = pastDays(ctx).slice(-13);
  const spark = (f: (d: DayTotal) => number, todayVal: number) => [...days.map(f), todayVal];
  // Today's partial value would dip the sparkline, so project it to a full day for the last point.
  const share = todayShareSoFar(ctx);
  return [
    { id: "orders", label: "Orders today", value: oT, deltaPct: pct(oT, oL), goodWhenUp: true, spark: spark((d) => d.orders, share ? oT / share : oT), compare: `vs ${Math.round(oL)} last ${DAYS_LONG[mondayIndex(ctx.now)]}` },
    { id: "revenue", label: "Revenue", value: rT, deltaPct: pct(rT, rL), goodWhenUp: true, spark: spark((d) => d.revenue, share ? rT / share : rT), compare: `vs ${usd(rL)} last week` },
    { id: "prep", label: "Avg prep time", value: pT, deltaPct: pct(pT, pL), goodWhenUp: false, spark: spark((d) => d.prepMin, pT), compare: `vs ${pL.toFixed(1)} min last week` },
    { id: "aov", label: "Avg order value", value: oT ? rT / oT : 0, deltaPct: pct(oT ? rT / oT : 0, oL ? rL / oL : 0), goodWhenUp: true, spark: spark((d) => (d.orders ? d.revenue / d.orders : 0), oT ? rT / oT : 0), compare: `vs ${usd(oL ? rL / oL : 0)} last week` },
  ];
}

/** Fraction of a typical day's orders that happen before `now`. */
function todayShareSoFar(ctx: Ctx) {
  const dow = mondayIndex(ctx.now);
  const nowH = ctx.now.getHours();
  const frac = ctx.now.getMinutes() / 60;
  const recs = ctx.history.filter((r) => r.dow === dow && r.date < todayISO(ctx));
  const total = recs.reduce((a, r) => a + r.orders, 0);
  if (!total) return 0;
  const before = recs.reduce((a, r) => a + (r.hour < nowH ? r.orders : r.hour === nowH ? r.orders * frac : 0), 0);
  return before / total;
}

export const usd = (v: number, dp = 0) => `$${v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

// ── Learned effects ──────────────────────────────────────────────────────────
/** How much rain changes daily orders of an item (or all orders), learned from history. 1.3 = +30%. */
export function rainLift(ctx: Ctx, itemId?: string): { lift: number; rainDays: number; orders: number } {
  const days = pastDays(ctx);
  const val = (d: DayTotal) => (itemId ? d.items[itemId] ?? 0 : d.orders);
  const ratios: number[] = [];
  let rainDays = 0;
  for (let dow = 0; dow < 7; dow++) {
    const same = days.filter((d) => d.dow === dow);
    const dry = same.filter((d) => !d.rain).map(val);
    const wet = same.filter((d) => d.rain).map(val);
    if (dry.length && wet.length) {
      ratios.push(mean(wet) / Math.max(1e-6, mean(dry)));
      rainDays += wet.length;
    }
  }
  return { lift: ratios.length ? mean(ratios) : 1, rainDays, orders: days.filter((d) => d.rain).reduce((a, d) => a + d.orders, 0) };
}

/** Item share of orders after 9pm vs the rest of the day. */
export function lateNightMultiplier(ctx: Ctx, itemId: string) {
  let lateO = 0, lateI = 0, dayO = 0, dayI = 0;
  for (const r of ctx.history) {
    if (r.hour >= 21) {
      lateO += r.orders;
      lateI += r.items[itemId] ?? 0;
    } else {
      dayO += r.orders;
      dayI += r.items[itemId] ?? 0;
    }
  }
  return { mult: lateO && dayI ? lateI / lateO / (dayI / dayO) : 1, orders: lateO };
}

/** How often an item sells out, by weekday. */
export function soldOutPattern(ctx: Ctx, itemId: string) {
  const byDate = new Map<string, { dow: number; hour: number }>();
  for (const r of ctx.history) if (r.soldOut.includes(itemId) && !byDate.has(r.date)) byDate.set(r.date, { dow: r.dow, hour: r.hour });
  const perDow = Array.from({ length: 7 }, (_, dow) => {
    const total = new Set(ctx.history.filter((r) => r.dow === dow && r.date < todayISO(ctx)).map((r) => r.date)).size;
    const hits = [...byDate.values()].filter((v) => v.dow === dow);
    return { dow, total, hits: hits.length, typicalHour: hits.length ? Math.round(mean(hits.map((h) => h.hour))) : null };
  });
  const worst = [...perDow].sort((a, b) => b.hits / Math.max(1, b.total) - a.hits / Math.max(1, a.total))[0];
  const last4w = [...byDate.keys()].filter((d) => d >= toISODate(addDays(ctx.now, -28))).length;
  return { perDow, worst, daysLast4w: last4w };
}

// ── Heatmap ──────────────────────────────────────────────────────────────────
export type HeatCell = { dow: number; hour: number; value: number; low?: number; high?: number; predicted: boolean; samples: number };
export type Window = { dow: number; start: number; end: number; value: number };
export type HeatmapData = {
  cells: HeatCell[][];
  min: number;
  max: number;
  peak: Window;
  slow: Window;
  takeaway: string;
  confidence?: { label: "High" | "Medium" | "Low"; pct: number };
  weeksUsed: number;
};

function metricOf(r: HourRecord, m: Metric) {
  return m === "orders" ? r.orders : m === "revenue" ? r.revenue : r.prepMin;
}

export function heatmap(ctx: Ctx, metric: Metric, range: Range): HeatmapData {
  const t = todayISO(ctx);
  const cells: HeatCell[][] = [];
  let weeksUsed = 0;
  let conf: HeatmapData["confidence"];
  if (range === "next") {
    const relErr: number[] = [];
    const start = nextMonday(ctx.now);
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(start, dow);
      cells.push(
        HOURS.map((hour) => {
          const f = forecastHour(ctx, date, hour, metric);
          if (f.mean > 0) relErr.push((f.high - f.low) / 2 / f.mean);
          return { dow, hour, value: f.mean, low: f.low, high: f.high, predicted: true, samples: f.samples };
        }),
      );
    }
    weeksUsed = Math.min(4, weeksOfData(ctx));
    const pct = Math.round(mean(relErr) * 100);
    conf = { label: pct <= 15 ? "High" : pct <= 28 ? "Medium" : "Low", pct };
  } else {
    const weeks = range === "4w" ? 4 : 12;
    const from = toISODate(addDays(ctx.now, -weeks * 7));
    const recs = ctx.history.filter((r) => r.date >= from && r.date < t);
    weeksUsed = Math.min(weeks, weeksOfData(ctx));
    for (let dow = 0; dow < 7; dow++) {
      cells.push(
        HOURS.map((hour) => {
          const rs = recs.filter((r) => r.dow === dow && r.hour === hour);
          return { dow, hour, value: mean(rs.map((r) => metricOf(r, metric))), predicted: false, samples: rs.length };
        }),
      );
    }
  }
  const flat = cells.flat();
  const values = flat.map((c) => c.value);
  const peak = bestWindow(cells, "max");
  const slow = bestWindow(cells, "min");
  return { cells, min: Math.min(...values), max: Math.max(...values), peak, slow, takeaway: heatTakeaway(metric, range, peak), confidence: conf, weeksUsed };
}

/** Best 2-hour window (sum of two adjacent cells). The quietest window ignores the first/last hour of service. */
function bestWindow(cells: HeatCell[][], mode: "max" | "min"): Window {
  let best: Window | null = null;
  for (const row of cells) {
    for (let i = 0; i < row.length - 1; i++) {
      if (mode === "min" && (i === 0 || i >= row.length - 2)) continue;
      const v = row[i].value + row[i + 1].value;
      if (!best || (mode === "max" ? v > best.value : v < best.value)) best = { dow: row[i].dow, start: row[i].hour, end: row[i].hour + 2, value: v };
    }
  }
  return best!;
}

function heatTakeaway(metric: Metric, range: Range, peak: Window) {
  const when = `${plural(peak.dow)} ${windowLabel(peak.start, peak.end)}`;
  if (metric === "prep") return `Prep time runs longest on ${when}, about ${(peak.value / 2).toFixed(1)} min a ticket.`;
  if (metric === "revenue") return `${when} ${range === "next" ? "should bring" : "bring"} in the most money, about ${usd(peak.value)} in 2 hours.`;
  return range === "next" ? `Next ${DAYS_LONG[peak.dow]} ${windowLabel(peak.start, peak.end)} should be your busiest 2 hours, about ${Math.round(peak.value)} orders.` : `${when} are your busiest 2 hours, about ${Math.round(peak.value)} orders.`;
}

export function cellDetail(ctx: Ctx, dow: number, hour: number, range: Range) {
  const t = todayISO(ctx);
  const weeks = range === "12w" ? 12 : 4;
  const from = toISODate(addDays(ctx.now, -weeks * 7));
  const rs = ctx.history.filter((r) => r.date >= from && r.date < t && r.dow === dow && r.hour === hour);
  const allSameHour = ctx.history.filter((r) => r.date >= from && r.date < t && r.hour === hour);
  const orders = mean(rs.map((r) => r.orders));
  const itemTotals = MENU.map((m) => ({ item: m, avg: mean(rs.map((r) => r.items[m.id] ?? 0)) })).sort((a, b) => b.avg - a.avg);
  let predicted: ReturnType<typeof forecastHour> | undefined;
  if (range === "next") predicted = forecastHour(ctx, addDays(nextMonday(ctx.now), dow), hour, "orders");
  return {
    dow,
    hour,
    orders: predicted ? predicted.mean : orders,
    range: predicted ? ([predicted.low, predicted.high] as [number, number]) : undefined,
    revenue: mean(rs.map((r) => r.revenue)),
    prepMin: mean(rs.map((r) => r.prepMin)),
    dashersWaiting: mean(rs.map((r) => r.dashersWaiting)),
    vsAvgPct: ((orders - mean(allSameHour.map((r) => r.orders))) / Math.max(1, mean(allSameHour.map((r) => r.orders)))) * 100,
    topItems: itemTotals.slice(0, 3),
    samples: rs.length,
  };
}

// ── Forecast ─────────────────────────────────────────────────────────────────
export function nextMonday(now: Date) {
  const d = mondayIndex(now);
  return addDays(now, 7 - d);
}

/** Week-over-week growth learned from the last 8 weeks (or what we have). */
function weeklyGrowth(ctx: Ctx) {
  const days = pastDays(ctx);
  if (days.length < 28) return 1;
  const recent = days.slice(-28).reduce((a, d) => a + d.orders, 0);
  const prev = days.slice(-56, -28);
  if (prev.length < 28) return 1;
  const ratio = recent / prev.reduce((a, d) => a + d.orders, 0);
  return Math.pow(ratio, 1 / 4);
}

const WEIGHTS = [0.4, 0.3, 0.2, 0.1];

/** Forecast one hour: weighted average of the same weekday-hour over the last 4 weeks × growth × weather. */
export function forecastHour(ctx: Ctx, date: Date, hour: number, metric: Metric = "orders", itemId?: string) {
  const dow = mondayIndex(date);
  const t = todayISO(ctx);
  const recs = ctx.history.filter((r) => r.dow === dow && r.hour === hour && r.date < t && r.date < toISODate(date)).slice(-4).reverse();
  const vals = recs.map((r) => (itemId ? r.items[itemId] ?? 0 : metricOf(r, metric)));
  if (!vals.length) return { mean: 0, low: 0, high: 0, samples: 0 };
  const w = WEIGHTS.slice(0, vals.length);
  let m = vals.reduce((a, v, i) => a + v * w[i], 0) / w.reduce((a, b) => a + b, 0);
  const daysAhead = Math.max(0, (date.getTime() - ctx.now.getTime()) / 86_400_000);
  if (metric !== "prep") m *= Math.pow(weeklyGrowth(ctx), 2 + daysAhead / 7);
  const wx = ctx.weather.find((x) => x.date === toISODate(date));
  if (wx?.condition === "rain" && metric !== "prep") m *= rainLift(ctx, itemId).lift;
  const spread = Math.max(sd(vals), m * 0.07) * (vals.length < 3 ? 1.6 : 1);
  return { mean: m, low: Math.max(0, m - 1.28 * spread), high: m + 1.28 * spread, samples: vals.length };
}

export type ForecastPoint = { date: string; label: string; dow: number; actual?: number; predicted?: number; band?: [number, number]; rain?: boolean; soFar?: number };

/** Last 14 days actual + next 7 days predicted (daily orders). */
export function forecastDays(ctx: Ctx): ForecastPoint[] {
  const days = pastDays(ctx).slice(-14);
  const pts: ForecastPoint[] = days.map((d) => ({ date: d.date, dow: d.dow, label: shortDate(d.date), actual: d.orders, rain: d.rain }));
  // Today: what's happened so far + the forecast for the rest of the day.
  const t = todayISO(ctx);
  const nowH = ctx.now.getHours();
  const soFar = ctx.history.filter((r) => r.date === t).reduce((a, r) => a + r.orders, 0);
  const rest = HOURS.filter((h) => h >= nowH).map((h) => forecastHour(ctx, ctx.now, h));
  const restMean = rest.reduce((a, f) => a + f.mean * (f === rest[0] ? 1 - ctx.now.getMinutes() / 60 : 1), 0);
  const restSd = rest.reduce((a, f) => a + (f.high - f.mean) / 1.28, 0) * 0.7;
  const todayPred = soFar + restMean;
  const lastPast = pts[pts.length - 1];
  if (lastPast) {
    lastPast.predicted = lastPast.actual;
    lastPast.band = [lastPast.actual!, lastPast.actual!];
  }
  pts.push({ date: t, dow: mondayIndex(ctx.now), label: "Today", actual: undefined, predicted: todayPred, band: [todayPred - 1.28 * restSd, todayPred + 1.28 * restSd], soFar });
  for (let i = 1; i <= 7; i++) {
    const date = addDays(ctx.now, i);
    const hours = HOURS.map((h) => forecastHour(ctx, date, h));
    const m = hours.reduce((a, f) => a + f.mean, 0);
    // Daily spread: hours are correlated, so combine half-way between independent and fully correlated.
    const indep = Math.sqrt(hours.reduce((a, f) => a + ((f.high - f.mean) / 1.28) ** 2, 0));
    const corr = hours.reduce((a, f) => a + (f.high - f.mean) / 1.28, 0);
    const s = (indep + corr) / 2;
    const wx = ctx.weather.find((x) => x.date === toISODate(date));
    pts.push({ date: toISODate(date), dow: mondayIndex(date), label: shortDate(toISODate(date)), predicted: m, band: [Math.max(0, m - 1.28 * s), m + 1.28 * s], rain: wx?.condition === "rain" });
  }
  return pts;
}

export const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${DAYS[mondayIndex(date)]} ${m}/${d}`;
};

/** Accuracy of last week's forecast (1 − MAPE on daily orders), made with data available before each day. */
export function backtestAccuracy(ctx: Ctx) {
  const days = pastDays(ctx).slice(-7);
  if (pastDays(ctx).length < 21) return null;
  const errs = days.map((d) => {
    const [y, m, dd] = d.date.split("-").map(Number);
    const date = new Date(y, m - 1, dd);
    const sub: Ctx = { ...ctx, now: date, history: ctx.history.filter((r) => r.date < d.date) };
    const pred = HOURS.reduce((a, h) => a + forecastHour(sub, date, h).mean, 0);
    return Math.abs(pred - d.orders) / Math.max(1, d.orders);
  });
  return Math.round((1 - mean(errs)) * 100);
}

/** Forecast item counts for one day. */
export function forecastItemsForDay(ctx: Ctx, date: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of MENU) out[m.id] = HOURS.reduce((a, h) => a + forecastHour(ctx, date, h, "orders", m.id).mean, 0);
  return out;
}

// ── Menu performance ─────────────────────────────────────────────────────────
export type Badge = "Star" | "Rising" | "Slow mover" | "Often sold out";
export type ItemPerf = { item: MenuItem; orders7d: number; revenue7d: number; prev7d: number; /** week over week */ trendPct: number; /** share of all orders, last 4 weeks vs the 4 before */ shareGrowthPct: number; badge?: Badge; daily: number[]; soldOutDays4w: number };

export function menuPerformance(ctx: Ctx): ItemPerf[] {
  const days = pastDays(ctx);
  const last7 = days.slice(-7);
  const prev7 = days.slice(-14, -7);
  const perf = MENU.map((item) => {
    const o7 = last7.reduce((a, d) => a + (d.items[item.id] ?? 0), 0);
    const p7 = prev7.reduce((a, d) => a + (d.items[item.id] ?? 0), 0);
    // Trend over 4 weeks vs the 4 before is steadier than week-over-week.
    const r4 = days.slice(-28).reduce((a, d) => a + (d.items[item.id] ?? 0), 0);
    const p4 = days.slice(-56, -28).reduce((a, d) => a + (d.items[item.id] ?? 0), 0);
    const tot4 = days.slice(-28).reduce((a, d) => a + d.orders, 0);
    const totP4 = days.slice(-56, -28).reduce((a, d) => a + d.orders, 0);
    const shareGrowthPct = p4 && totP4 ? ((r4 / tot4) / (p4 / totP4) - 1) * 100 : 0;
    const trendPct = p7 ? ((o7 - p7) / p7) * 100 : 0;
    return { item, orders7d: o7, revenue7d: o7 * item.price, prev7d: p7, trendPct, shareGrowthPct, daily: days.slice(-28).map((d) => d.items[item.id] ?? 0), soldOutDays4w: soldOutPattern(ctx, item.id).daysLast4w } as ItemPerf;
  });
  const byOrders = [...perf].sort((a, b) => b.orders7d - a.orders7d);
  const stars = new Set(byOrders.slice(0, 3).map((p) => p.item.id));
  const slow = new Set(byOrders.slice(-2).map((p) => p.item.id));
  for (const p of perf) {
    if (p.soldOutDays4w >= 3) p.badge = "Often sold out";
    else if (stars.has(p.item.id)) p.badge = "Star";
    else if (p.shareGrowthPct >= 6) p.badge = "Rising";
    else if (slow.has(p.item.id)) p.badge = "Slow mover";
  }
  return perf;
}

export type SortKey = "orders" | "revenue" | "trending" | "least";
export function sortMenu(perf: ItemPerf[], key: SortKey) {
  const s = [...perf];
  if (key === "orders") s.sort((a, b) => b.orders7d - a.orders7d);
  if (key === "revenue") s.sort((a, b) => b.revenue7d - a.revenue7d);
  if (key === "trending") s.sort((a, b) => b.shareGrowthPct - a.shareGrowthPct);
  if (key === "least") s.sort((a, b) => a.orders7d - b.orders7d);
  return s;
}

export function itemDetail(ctx: Ctx, itemId: string) {
  const item = MENU_BY_ID[itemId];
  const days = pastDays(ctx);
  // Weekly totals for the whole history.
  const weekly: { label: string; orders: number }[] = [];
  for (let i = days.length; i > 0; i -= 7) {
    const chunk = days.slice(Math.max(0, i - 7), i);
    if (chunk.length < 7) break;
    weekly.unshift({ label: shortDate(chunk[0].date).split(" ")[1], orders: chunk.reduce((a, d) => a + (d.items[itemId] ?? 0), 0) });
  }
  const t = todayISO(ctx);
  const recent = ctx.history.filter((r) => r.date < t && r.date >= toISODate(addDays(ctx.now, -28)));
  const byHour = HOURS.map((h) => ({ hour: h, label: hourShort(h), orders: mean(recent.filter((r) => r.hour === h).map((r) => r.items[itemId] ?? 0)) }));
  const peakHour = [...byHour].sort((a, b) => b.orders - a.orders)[0];
  const byDow = DAYS.map((label, dow) => ({ label, orders: mean(days.slice(-28).filter((d) => d.dow === dow).map((d) => d.items[itemId] ?? 0)) }));
  const bestDow = byDow.reduce((best, d, i) => (d.orders > byDow[best].orders ? i : best), 0);
  const perf = menuPerformance(ctx).find((p) => p.item.id === itemId)!;
  return {
    item,
    perf,
    weekly,
    byHour,
    peakHour,
    bestDow,
    pairings: (PAIRINGS[itemId] ?? []).map((p) => ({ ...p, item: MENU_BY_ID[p.itemId] })),
    suggestion: itemSuggestion(ctx, perf, peakHour.hour, bestDow),
  };
}

function itemSuggestion(ctx: Ctx, p: ItemPerf, peakHour: number, bestDow: number) {
  const name = p.item.name;
  const pair = PAIRINGS[p.item.id]?.[0];
  const pairName = pair ? MENU_BY_ID[pair.itemId].name : "";
  if (p.badge === "Often sold out") {
    const sp = soldOutPattern(ctx, p.item.id);
    return `${name} sold out on ${sp.daysLast4w} of the last 28 days, usually ${plural(sp.worst.dow)} around ${hourLabel(sp.worst.typicalHour ?? 20)}. Prep 25% more chashu on ${plural(sp.worst.dow)} to keep it on the menu all night.`;
  }
  if (p.item.lateLift && p.item.lateLift > 2) return `${name} sells ${lateNightMultiplier(ctx, p.item.id).mult.toFixed(1)}× more after 9pm. A late-night combo with a drink could lift Friday and Saturday sales.`;
  if (p.badge === "Rising") return `${name} is growing faster than the rest of your menu (+${Math.round(p.shareGrowthPct)}% share of orders in 4 weeks). Give it a top spot on your menu and raise its par level.`;
  if (p.badge === "Slow mover") return `${name} is one of your slowest items. Try bundling it with ${pairName || "a drink"} or move it lower on the menu.`;
  if (p.badge === "Star") return `${name} is a top seller, busiest ${DAYS_LONG[bestDow]}s around ${hourLabel(peakHour)}. ${pair ? `${pair.pct}% of these orders add ${pairName}; offer it as a combo.` : ""}`;
  return `${name} peaks around ${hourLabel(peakHour)}. ${pair ? `${pair.pct}% of orders also include ${pairName}.` : ""}`;
}

// ── Purchasing, prep, staffing ───────────────────────────────────────────────
export type ShoppingRow = { ingredient: (typeof INGREDIENTS)[number]; needed: number; usual: number; delta: number; toBuy: number; reason?: string };

/** Ingredients needed for the next `days` days vs what you usually use over the same weekdays. */
export function shoppingList(ctx: Ctx, days = 7): ShoppingRow[] {
  const dates = Array.from({ length: days }, (_, i) => addDays(ctx.now, i + 1));
  const predictedItems: Record<string, number> = {};
  for (const d of dates) for (const [k, v] of Object.entries(forecastItemsForDay(ctx, d))) predictedItems[k] = (predictedItems[k] ?? 0) + v;
  // Usual = average usage for the same weekdays over the last 4 weeks.
  const past = pastDays(ctx).slice(-28);
  const dows = dates.map(mondayIndex);
  const usualItems: Record<string, number> = {};
  for (const m of MENU) usualItems[m.id] = dows.reduce((a, dow) => a + mean(past.filter((d) => d.dow === dow).map((d) => d.items[m.id] ?? 0)), 0);
  const use = (items: Record<string, number>, ingId: string) => MENU.reduce((a, m) => a + (items[m.id] ?? 0) * (m.ingredients.find((i) => i.id === ingId)?.qty ?? 0), 0);
  const rainy = ctx.weather.filter((w) => dates.some((d) => toISODate(d) === w.date) && w.condition === "rain").map((w) => DAYS_LONG[w.dow]);
  const chashuOut = soldOutPattern(ctx, "chashu_bowl");
  return INGREDIENTS.map((ing) => {
    let needed = use(predictedItems, ing.id);
    const usual = use(usualItems, ing.id);
    let reason: string | undefined;
    if (ing.id === "pork_belly" && chashuOut.daysLast4w >= 3 && dows.includes(5)) {
      needed *= 1.2; // cover the Saturday sell-out
      reason = "Saturday sell-out";
    } else if (rainy.length && ["tonkotsu_broth", "noodles", "pork_belly", "eggs"].includes(ing.id) && needed > usual * 1.04) {
      reason = `Rain ${DAYS[DAYS_LONG.indexOf(rainy[0])]}`;
    }
    const step = ing.unit === "pcs" || ing.unit === "portions" || ing.unit === "eggs" || ing.unit === "qt" ? 1 : 0.5;
    const r = (v: number) => Math.round(v / step) * step;
    return { ingredient: ing, needed: r(needed), usual: r(usual), delta: r(needed - usual), toBuy: Math.max(0, r(needed - ing.onHand)), reason };
  }).sort((a, b) => Number(!!b.reason) - Number(!!a.reason) || b.delta / Math.max(1, b.usual) - a.delta / Math.max(1, a.usual));
}

export type PrepDay = { date: string; dow: number; label: string; bowls: number; usualBowls: number; extra: number; byTime: string; note: string; rain: boolean; /** worth calling out */ flag: boolean };
const RAMEN_IDS = MENU.filter((m) => m.category === "Ramen").map((m) => m.id);

export function prepPlan(ctx: Ctx): PrepDay[] {
  const past = pastDays(ctx).slice(-28);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(ctx.now, i + 1);
    const dow = mondayIndex(date);
    const items = forecastItemsForDay(ctx, date);
    const bowls = Math.round(RAMEN_IDS.reduce((a, id) => a + items[id], 0));
    const usualBowls = Math.round(mean(past.filter((d) => d.dow === dow).map((d) => RAMEN_IDS.reduce((a, id) => a + (d.items[id] ?? 0), 0))));
    const extra = Math.round((bowls - usualBowls) / 5) * 5;
    const rain = ctx.weather.find((w) => w.date === toISODate(date))?.condition === "rain";
    const gyoza = Math.round((items.gyoza ?? 0) * 6 / 10) * 10;
    const flag = extra >= Math.max(10, usualBowls * 0.08);
    const note =
      flag
        ? `Prep ${extra} extra ramen bowls by 5pm${rain ? " (rain)" : ""}`
        : extra <= -Math.max(10, usualBowls * 0.08)
          ? `Lighter day: prep ${Math.abs(extra)} fewer bowls`
          : `Normal prep: ${bowls} bowls, ${gyoza} gyoza`;
    return { date: toISODate(date), dow, label: DAYS_LONG[dow], bowls, usualBowls, extra, byTime: "5pm", note, rain, flag };
  });
}

export type StaffSuggestion = { dow: number; date: string; start: number; end: number; cooks: number; peakOrders: number; text: string };

export function staffing(ctx: Ctx): StaffSuggestion[] {
  const out: StaffSuggestion[] = [];
  for (let i = 1; i <= 7; i++) {
    const date = addDays(ctx.now, i);
    const dow = mondayIndex(date);
    const need = HOURS.map((h) => ({ h, o: forecastHour(ctx, date, h).mean }));
    let run: { start: number; end: number; peak: number } | null = null;
    const flush = () => {
      if (run && run.end - run.start >= 1) {
        const extra = Math.ceil(run.peak / STORE.ordersPerCookPerHour) - STORE.lineCooksBase;
        const start = Math.max(STORE.openHour, run.start - 1); // arrive an hour early to set up
        out.push({ dow, date: toISODate(date), start, end: run.end, cooks: extra, peakOrders: Math.round(run.peak), text: `Add ${extra} line cook${extra > 1 ? "s" : ""} ${DAYS[dow]} ${windowLabel(start, run.end)}` });
      }
      run = null;
    };
    for (const { h, o } of need) {
      if (o > STORE.lineCooksBase * STORE.ordersPerCookPerHour * 0.92) {
        const cur = run as { start: number; end: number; peak: number } | null;
        run = cur ? { ...cur, end: h + 1, peak: Math.max(cur.peak, o) } : { start: h, end: h + 1, peak: o };
      } else flush();
    }
    flush();
  }
  return out;
}

// ── AI insights ──────────────────────────────────────────────────────────────
export type InsightAction = "plan_prep" | "add_to_order" | "create_promo" | "plan_staff";
export type Insight = { id: string; icon: "rain" | "soldout" | "moon" | "staff" | "trend" | "quiet"; title: string; detail: string; action: { label: string; kind: InsightAction }; basedOn: number };

export function insights(ctx: Ctx): Insight[] {
  const out: Insight[] = [];
  const days = pastDays(ctx);
  const rainDay = ctx.weather.find((w) => w.condition === "rain");
  const tk = rainLift(ctx, "tonkotsu");
  if (rainDay && tk.rainDays >= 2 && tk.lift > 1.08) {
    out.push({
      id: "rain",
      icon: "rain",
      title: `Tonkotsu Ramen orders up ${Math.round((tk.lift - 1) * 100)}% on rainy days. Rain is forecast ${DAYS_LONG[rainDay.dow]}.`,
      detail: `Plan for about ${prepPlan(ctx).find((p) => p.rain)?.extra ?? 30} extra ramen bowls and more broth that day.`,
      action: { label: "Plan prep", kind: "plan_prep" },
      basedOn: tk.orders,
    });
  }
  const so = soldOutPattern(ctx, "chashu_bowl");
  const satShare = so.perDow[5].total ? so.perDow[5].hits / so.perDow[5].total : 0;
  if (satShare >= 0.5) {
    out.push({
      id: "soldout",
      icon: "soldout",
      title: `You run out of chashu most Saturdays by ${hourLabel(so.perDow[5].typicalHour ?? 20)}. Order 20% more pork belly.`,
      detail: `Chashu sold out on ${so.perDow[5].hits} of the last ${so.perDow[5].total} Saturdays.`,
      action: { label: "Add to order list", kind: "add_to_order" },
      basedOn: days.filter((d) => d.dow === 5).reduce((a, d) => a + d.orders, 0),
    });
  }
  const late = lateNightMultiplier(ctx, "karaage");
  if (late.mult >= 2) {
    out.push({
      id: "late",
      icon: "moon",
      title: `Chicken Karaage sells ${late.mult.toFixed(0)}× more after 9pm. Consider a late-night promo.`,
      detail: "A karaage + Yuzu Lemonade combo from 9–11pm fits your Friday and Saturday late rush.",
      action: { label: "Create promo", kind: "create_promo" },
      basedOn: late.orders,
    });
  }
  const st = [...staffing(ctx)].sort((a, b) => b.peakOrders - a.peakOrders)[0];
  if (st) {
    out.push({
      id: "staff",
      icon: "staff",
      title: `${st.text}. Pulse expects up to ${st.peakOrders} orders an hour then.`,
      detail: `Your ${STORE.lineCooksBase} cooks handle about ${STORE.lineCooksBase * STORE.ordersPerCookPerHour} orders an hour comfortably.`,
      action: { label: "Plan staff", kind: "plan_staff" },
      basedOn: days.filter((d) => d.dow === st.dow).reduce((a, d) => a + d.orders, 0),
    });
  }
  if (out.length < 3) {
    const slow = heatmap(ctx, "orders", "4w").slow;
    out.push({
      id: "quiet",
      icon: "quiet",
      title: `${plural(slow.dow)} ${windowLabel(slow.start, slow.end)} are your quietest hours. A happy-hour deal could fill them.`,
      detail: `Only about ${Math.round(slow.value)} orders in those 2 hours.`,
      action: { label: "Create promo", kind: "create_promo" },
      basedOn: days.slice(-28).reduce((a, d) => a + d.orders, 0),
    });
  }
  return out.slice(0, 4);
}

// ── Live order prioritization ────────────────────────────────────────────────
export type Factor = { key: "dasher" | "prep" | "rush" | "batch" | "waiting"; label: string; detail: string; points: number };
export type ScoredOrder = LiveOrder & { score: number; factors: Factor[]; prepMin: number; arrivalRank: number; batchWith?: string; startIn: number };
export type RushInfo = { inMin: number; hour: number; expected: number; current: number; prepItem: string } | null;

/** When does the next rush start (predicted orders jump ≥35% vs this hour)? */
export function upcomingRush(ctx: Ctx): RushInfo {
  const nowH = ctx.now.getHours();
  const nowMin = nowH * 60 + ctx.now.getMinutes();
  const cur = forecastHour(ctx, ctx.now, nowH).mean || 1;
  for (const h of HOURS.filter((h) => h > nowH && h <= nowH + 2)) {
    const f = forecastHour(ctx, ctx.now, h).mean;
    if (f >= cur * 1.25 && f >= 16) return { inMin: h * 60 - nowMin, hour: h, expected: Math.round(f), current: Math.round(cur), prepItem: "broth" };
  }
  return null;
}

/** Live-load factor: prep runs slower when the kitchen is busy (from the heatmap's prep data). */
function loadFactor(ctx: Ctx) {
  const f = forecastHour(ctx, ctx.now, ctx.now.getHours(), "prep").mean;
  return f ? f / 9.5 : 1;
}

export function prioritize(ctx: Ctx, orders: LiveOrder[]): { orders: ScoredOrder[]; rush: RushInfo } {
  const rush = upcomingRush(ctx);
  const lf = loadFactor(ctx);
  const arrival = [...orders].sort((a, b) => b.placedMinAgo - a.placedMinAgo).map((o) => o.id);
  const itemCount = new Map<string, string[]>();
  for (const o of orders) for (const it of o.items) itemCount.set(it.itemId, [...(itemCount.get(it.itemId) ?? []), o.id]);

  const scored = orders.map((o) => {
    const fullPrep = Math.round(Math.max(...o.items.map((it) => MENU_BY_ID[it.itemId].prepMin)) * lf + 1);
    // Orders already on the line only need the prep time they have left.
    const startedMin = o.status === "preparing" ? Math.max(0, o.placedMinAgo - 1) : 0;
    const prep = Math.max(1, fullPrep - startedMin);
    // The core signal: how late would the food be for the Dasher if we started it right now?
    const lateBy = prep - o.dasherEtaMin; // > 0 = Dasher waits; < 0 = minutes of slack
    const factors: Factor[] = [];
    // 1. Dasher timing (0–70): 50 at "ready exactly when the Dasher walks in", +5/min late, −5/min of slack.
    const dasherPts = Math.round(lateBy >= 0 ? 50 + Math.min(20, lateBy * 5) : Math.max(0, 50 + lateBy * 5));
    if (dasherPts > 0)
      factors.push({
        key: "dasher",
        label: lateBy > 0 ? "Dasher will be waiting" : "Dasher arriving soon",
        detail: lateBy > 0 ? `${o.dasherName} arrives in ${o.dasherEtaMin} min; food needs ${prep} min, so about ${lateBy} min late` : `${o.dasherName} arrives in ${o.dasherEtaMin} min; food needs ${prep} min (${-lateBy} min to spare)`,
        points: dasherPts,
      });
    const notStarted = o.status !== "preparing";
    // 2. Long prep items: start them early (only matters if not started yet).
    if (notStarted && fullPrep >= 12) factors.push({ key: "prep", label: "Long prep items", detail: `${MENU_BY_ID[[...o.items].sort((a, b) => MENU_BY_ID[b.itemId].prepMin - MENU_BY_ID[a.itemId].prepMin)[0].itemId].name} takes about ${fullPrep} min right now`, points: 5 });
    // 3. Predicted rush: get broth-based bowls moving before the wave.
    const usesBroth = o.items.some((it) => MENU_BY_ID[it.itemId].category === "Ramen");
    if (notStarted && rush && rush.inMin <= 30 && usesBroth) factors.push({ key: "rush", label: `Rush starting in ${rush.inMin} min`, detail: `Pulse predicts ${rush.expected} orders at ${hourLabel(rush.hour)} (vs ${rush.current} now). Clear ramen tickets before the wave.`, points: 10 });
    // 4. Batching with another order that shares an item.
    const shared = o.items.map((it) => ({ it, others: (itemCount.get(it.itemId) ?? []).filter((id) => id !== o.id) })).find((x) => x.others.length && MENU_BY_ID[x.it.itemId].category !== "Drinks");
    if (shared && notStarted) factors.push({ key: "batch", label: "Batch with similar items", detail: `Cook ${MENU_BY_ID[shared.it.itemId].name} together with order ${shared.others[0]}`, points: 5 });
    // 5. Time already waiting (tie-breaker).
    const waitPts = Math.round(Math.min(5, o.placedMinAgo * 0.8));
    if (waitPts >= 2) factors.push({ key: "waiting", label: "Waiting the longest", detail: `Placed ${o.placedMinAgo} min ago`, points: waitPts });
    const score = Math.max(1, Math.min(99, factors.reduce((a, f) => a + f.points, 0)));
    return { ...o, score, factors: factors.sort((a, b) => b.points - a.points), prepMin: prep, arrivalRank: arrival.indexOf(o.id) + 1, batchWith: notStarted ? shared?.others[0] : undefined, startIn: Math.max(0, -lateBy) };
  });
  scored.sort((a, b) => b.score - a.score || a.dasherEtaMin - b.dasherEtaMin);
  return { orders: scored, rush };
}

export function priorityLevel(score: number): "Urgent" | "High" | "Normal" | "Low" {
  // Urgent = the Dasher will wait; High = start now; Normal = start soon; Low = plenty of time.
  return score >= 70 ? "Urgent" : score >= 50 ? "High" : score >= 25 ? "Normal" : "Low";
}
