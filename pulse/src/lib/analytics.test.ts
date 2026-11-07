import { describe, expect, it } from "vitest";
import { generateHistory, liveOrders, weatherForecast } from "@/data/mock";
import * as A from "@/lib/analytics";

const t = new Date();
const now = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 17, 40);
const ctx: A.Ctx = { now, history: generateHistory(now, 12), weather: weatherForecast(now) };

describe("Pulse analytics", () => {
  it("has 12 weeks of data and the expected busy patterns", () => {
    expect(A.weeksOfData(ctx)).toBe(12);
    const hm = A.heatmap(ctx, "orders", "12w");
    expect([4, 5]).toContain(hm.peak.dow); // Fri or Sat
    expect([18, 17, 19]).toContain(hm.peak.start); // dinner
    expect(hm.slow.dow).toBe(0); // Monday is quietest
  });
  it("forecasts within a reasonable error and flags the rainy day", () => {
    expect(A.backtestAccuracy(ctx)).toBeGreaterThan(85);
    expect(A.forecastDays(ctx).some((p) => p.rain && p.actual === undefined)).toBe(true);
  });
  it("produces the headline insights", () => {
    const ids = A.insights(ctx).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["rain", "soldout", "late"]));
  });
  it("ranks live orders by priority, not arrival", () => {
    const { orders, rush } = A.prioritize(ctx, liveOrders(now));
    expect(rush?.inMin).toBe(20);
    for (let i = 1; i < orders.length; i++) expect(orders[i - 1].score).toBeGreaterThanOrEqual(orders[i].score);
    expect(orders.some((o, i) => o.arrivalRank !== i + 1)).toBe(true);
  });
  it("flags chashu as often sold out", () => {
    expect(A.menuPerformance(ctx).find((p) => p.item.id === "chashu_bowl")?.badge).toBe("Often sold out");
  });
});
