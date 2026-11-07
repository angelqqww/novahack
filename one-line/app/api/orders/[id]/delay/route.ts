import { delayDasher } from "@/lib/store";
import { body, json, orderId } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { minutes?: number } — push the dasher's ETA back (default 8). DoorDash orders only. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { minutes } = await body<{ minutes: number }>(req);
  const order = delayDasher(orderId((await ctx.params).id), Number.isFinite(minutes) ? Number(minutes) : 8);
  return order ? json({ order }) : json({ error: "not a DoorDash order" }, 404);
}
