import { parseNotesRules } from "@/lib/notes";
import { parseNotesLLM } from "@/lib/llm";
import { body, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** POST { notes } → { extraPrepMin, cookSeparately, flags, source: "llm" | "rules" } */
export async function POST(req: Request) {
  const { notes } = await body<{ notes: string }>(req);
  const text = String(notes ?? "");
  return json((await parseNotesLLM(text)) ?? parseNotesRules(text));
}
