import { startBatch } from "@/lib/store";
import { body, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { batchId } — put a batch on the station now (its orders move to cooking). */
export async function POST(req: Request) {
  const { batchId } = await body<{ batchId: string }>(req);
  if (!batchId) return json({ error: "batchId required" }, 400);
  return startBatch(batchId) ? json({ ok: true }) : json({ error: "batch not found" }, 404);
}
