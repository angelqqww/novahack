import { getState } from "@/lib/store";
import { explainQueueLLM } from "@/lib/llm";
import { explainQueueTemplate, queueDigest } from "@/lib/explain";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST → { text, source } — 2-sentence summary of the rush (LLM if a key is set, otherwise a template). */
export async function POST() {
  const state = getState();
  const llm = await explainQueueLLM(queueDigest(state));
  return json(llm ? { text: llm, source: "llm" } : { text: explainQueueTemplate(state), source: "rules" });
}
