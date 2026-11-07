// PURE: keyword-rule fallback for order notes (used when no LLM key is set, and as the instant first pass).
import type { ParsedNotes } from "./types";

export const EMPTY_NOTES: ParsedNotes = { extraPrepMin: 0, cookSeparately: false, flags: [], source: "rules" };

export function parseNotesRules(notes?: string): ParsedNotes {
  if (!notes || !notes.trim()) return { ...EMPTY_NOTES };
  const t = notes.toLowerCase();
  const flags = new Set<string>();
  let extra = 0;
  let separate = false;

  if (/allerg|anaphyla|celiac|epipen/.test(t)) {
    flags.add("ALLERGY");
    separate = true;
  }
  if (/cook (it |them )?separate|separate(ly)?|own pan|clean (grill|pan|fryer)|cross[- ]?contam/.test(t)) {
    flags.add(flags.has("ALLERGY") ? "ALLERGY" : "COOK SEPARATELY");
    separate = true;
  }
  if (/extra[- ]crisp|well[- ]done|crispy/.test(t)) {
    flags.add("EXTRA CRISPY");
    extra += 2;
  }
  if (/double meat|extra meat/.test(t)) {
    flags.add("EXTRA MEAT");
    extra += 1;
  }
  for (const m of t.matchAll(/\bno ([a-z]+)/g)) flags.add(`NO ${m[1].toUpperCase()}`);
  if (/on the side/.test(t)) flags.add("ON THE SIDE");
  if (/\basap\b|hurry|in a rush/.test(t)) flags.add("ASAP");
  if (/vegan|vegetarian/.test(t)) flags.add("VEGETARIAN");

  return { extraPrepMin: extra, cookSeparately: separate, flags: [...flags], source: "rules" };
}
