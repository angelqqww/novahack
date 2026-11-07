// Optional LLM features. Everything works without ANTHROPIC_API_KEY (keyword rules / templates instead).
import Anthropic from "@anthropic-ai/sdk";
import type { ParsedNotes } from "./types";

const MODEL = "claude-opus-5-5";

export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ timeout: 15_000, maxRetries: 1 }));

const NOTES_SCHEMA = {
  type: "object",
  properties: {
    extraPrepMin: { type: "number", description: "Extra minutes of cooking the note implies (0 if none)." },
    cookSeparately: { type: "boolean", description: "True if this order must not share a pan/batch with other orders (allergies, cross-contamination)." },
    flags: { type: "array", items: { type: "string" }, description: "Short UPPERCASE kitchen flags, e.g. ALLERGY, EXTRA CRISPY, NO ONIONS." },
  },
  required: ["extraPrepMin", "cookSeparately", "flags"],
  additionalProperties: false,
} as const;

const cache = new Map<string, ParsedNotes>();

/** Turn free-text order notes into structured kitchen instructions. Returns null on any failure. */
export async function parseNotesLLM(notes: string): Promise<ParsedNotes | null> {
  if (!llmEnabled() || !notes.trim()) return null;
  const hit = cache.get(notes);
  if (hit) return hit;
  try {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: NOTES_SCHEMA } },
      system:
        "You read order notes for a taqueria kitchen display. Return how many extra cooking minutes the note implies " +
        "(e.g. 'extra crispy' ≈ 2), whether the order must be cooked apart from other orders (any allergy or cross-contamination concern), " +
        "and short uppercase flags for the cooks.",
      messages: [{ role: "user", content: `Order note: ${notes}` }],
    });
    if (!("content" in res) || res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const raw = JSON.parse(text.text) as Omit<ParsedNotes, "source">;
    const parsed: ParsedNotes = {
      extraPrepMin: Math.max(0, Math.min(10, Number(raw.extraPrepMin) || 0)),
      cookSeparately: !!raw.cookSeparately,
      flags: (raw.flags ?? []).map((f) => String(f).toUpperCase()).slice(0, 5),
      source: "llm",
    };
    cache.set(notes, parsed);
    return parsed;
  } catch (err) {
    console.warn("[llm] note parsing failed, keeping keyword rules:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Two-sentence summary of the current rush for the "Explain the queue" button. */
export async function explainQueueLLM(summary: string): Promise<string | null> {
  if (!llmEnabled()) return null;
  try {
    const res = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 1024,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system:
        "You are the expediter at a busy taqueria. In exactly two short sentences, tell the line cooks what matters most right now " +
        "(what to fire first, what to hold, any batches or allergies). Plain words, no lists.",
      messages: [{ role: "user", content: summary }],
    });
    if (!("content" in res) || res.stop_reason === "refusal") return null;
    const text = res.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join(" ").trim();
    return text || null;
  } catch (err) {
    console.warn("[llm] explain failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
