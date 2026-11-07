import { addOrder, type NewOrderInput } from "@/lib/store";
import { body, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { channel?: "walkin"|"doordash", items?, notes?, customerName?, dasherName?, dasherEtaMin? } — omitted fields are randomized. */
export async function POST(req: Request) {
  const b = await body<NewOrderInput>(req);
  if (b.channel && b.channel !== "walkin" && b.channel !== "doordash") return json({ error: "bad channel" }, 400);
  return json({ order: addOrder(b) }, 201);
}
