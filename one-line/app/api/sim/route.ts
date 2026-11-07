import { simControl, type SimAction } from "@/lib/store";
import { body, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";
const ACTIONS = ["start", "pause", "speed", "rush", "random", "autocook", "scenario", "reset"];

/**
 * POST { action: "start" | "pause" | "reset" }
 *      { action: "speed", speed: 5 }
 *      { action: "rush" | "random" | "autocook", on: true }
 *      { action: "scenario", name?: "demo" }
 */
export async function POST(req: Request) {
  const b = (await body<SimAction>(req)) as SimAction;
  if (!b.action || !ACTIONS.includes(b.action)) return json({ error: "bad action" }, 400);
  return json(simControl(b));
}
