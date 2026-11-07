import type { MenuItem, Order, Priority } from "@/lib/types";

export function fmtClock(t: number, seconds = true): string {
  const d = new Date(t);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m}${seconds ? `:${s}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function fmtDay(t: number): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(t).getUTCDay()];
}

/** 3:07, or 12:40 */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.round(Math.abs(ms) / 1000));
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export const itemsText = (o: Order, byId: Record<string, MenuItem>) =>
  o.items.map((i) => `${i.qty}× ${byId[i.menuItemId]?.name ?? i.menuItemId}`).join("  ·  ");

export const PRIORITY_STYLE: Record<Priority, { label: string; stripe: string; text: string; chip: "redSolid" | "orange" | "amber" | "gray" }> = {
  late: { label: "Late", stripe: "bg-late", text: "text-late-text", chip: "redSolid" },
  start_now: { label: "Start now", stripe: "bg-now", text: "text-now-text", chip: "orange" },
  upcoming: { label: "Up next", stripe: "bg-upcoming", text: "text-upcoming-text", chip: "amber" },
  hold: { label: "Hold", stripe: "bg-hold", text: "text-hold-text", chip: "gray" },
};

export const STATION_LABEL: Record<string, string> = { grill: "Grill", fryer: "Fryer", cold: "Cold", assembly: "Assembly" };
