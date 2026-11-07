import type { OrderStatus } from "@/lib/types";
import { setStatus } from "@/lib/store";
import { body, json, orderId } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const STATUSES: OrderStatus[] = ["queued", "cooking", "ready", "picked_up"];

/** POST { status: "cooking" | "ready" | "picked_up" | "queued" } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { status } = await body<{ status: OrderStatus }>(req);
  if (!status || !STATUSES.includes(status)) return json({ error: "bad status" }, 400);
  const order = setStatus(orderId((await ctx.params).id), status);
  return order ? json({ order }) : json({ error: "not found" }, 404);
}
