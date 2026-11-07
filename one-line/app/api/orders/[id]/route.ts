import { getOrder } from "@/lib/store";
import { json, orderId } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** GET one order (handy for the dasher check-in page). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const order = getOrder(orderId((await ctx.params).id));
  return order ? json({ order }) : json({ error: "not found" }, 404);
}
