// The data layer. Today every call computes from the mock data with a little latency.
// To go live, replace each function body with a fetch() to your API and keep the return types.
import * as A from "@/lib/analytics";
import { liveOrders } from "@/data/mock";
import type { Ctx } from "@/lib/analytics";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const latency = () => 380 + Math.random() * 420;

async function call<T>(fn: () => T): Promise<T> {
  await wait(latency());
  return fn();
}

export const api = {
  kpis: (ctx: Ctx) => call(() => A.kpis(ctx)),
  insights: (ctx: Ctx) => call(() => A.insights(ctx)),
  heatmap: (ctx: Ctx, metric: A.Metric, range: A.Range) => call(() => A.heatmap(ctx, metric, range)),
  menu: (ctx: Ctx) => call(() => A.menuPerformance(ctx)),
  itemDetail: (ctx: Ctx, id: string) => call(() => A.itemDetail(ctx, id)),
  forecast: (ctx: Ctx) => call(() => ({ points: A.forecastDays(ctx), accuracy: A.backtestAccuracy(ctx), weather: ctx.weather })),
  shopping: (ctx: Ctx) => call(() => A.shoppingList(ctx)),
  prepPlan: (ctx: Ctx) => call(() => A.prepPlan(ctx)),
  staffing: (ctx: Ctx) => call(() => A.staffing(ctx)),
  queue: (ctx: Ctx) => call(() => A.prioritize(ctx, liveOrders(ctx.now))),
};
