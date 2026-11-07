// PURE: text summaries of the current queue (template fallback + the digest we send to the LLM).
import type { AppState } from "./types";
import { MIN } from "./config";

export function queueDigest(s: AppState): string {
  const name = (id: string) => s.menu.find((m) => m.id === id)?.name ?? id;
  const lines = s.orders.map((o) => {
    const items = o.items.map((i) => `${i.qty}× ${name(i.menuItemId)}`).join(", ");
    return `${o.id} ${o.channel} ${o.status}${o.priority ? ` [${o.priority}]` : ""}: ${items}. ${o.reason ?? ""}${o.flags?.length ? ` Flags: ${o.flags.join(", ")}` : ""}`;
  });
  const stations = s.stations.map((x) => `${x.station} ${x.plannedNow}/${x.capacity}`).join(", ");
  return [`Station load: ${stations}.`, ...lines, ...s.batches.map((b) => `Batch: ${b.reason}`), ...s.nearMisses.map((n) => n.reason)].join("\n");
}

export function explainQueueTemplate(s: AppState): string {
  const queued = s.orders.filter((o) => o.status === "queued");
  if (!queued.length) return "The queue is clear. Nothing to fire right now.";
  const late = queued.filter((o) => o.priority === "late");
  const now = queued.filter((o) => o.priority === "start_now");
  const hold = queued.filter((o) => o.priority === "hold");
  const full = s.stations.filter((x) => x.plannedNow >= x.capacity).map((x) => x.station);
  const first = [...late, ...now].map((o) => o.id).slice(0, 4);
  const s1 = first.length
    ? `Fire ${first.join(", ")} first${late.length ? ` — ${late.length} ${late.length === 1 ? "is" : "are"} running late` : ""}.`
    : `Nothing needs to start this minute; next up is ${queued[0].id} in ${Math.max(1, Math.round(((queued[0].startAt ?? s.simNow) - s.simNow) / MIN))} min.`;
  const parts: string[] = [];
  if (s.batches.length) parts.push(`${s.batches.length} batch${s.batches.length > 1 ? "es" : ""} ready to cook together`);
  if (hold.length) parts.push(`hold ${hold.length} DoorDash order${hold.length > 1 ? "s" : ""} until closer to pickup`);
  if (full.length) parts.push(`${full.join(" and ")} at capacity`);
  const s2 = parts.length ? `${cap(parts.join("; "))}.` : "Everything else is on track.";
  return `${s1} ${s2}`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
