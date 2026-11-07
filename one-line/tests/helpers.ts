import type { Order, PrepModel } from "@/lib/types";
import { MENU } from "@/lib/menu";
import { MIN, SIM_EPOCH } from "@/lib/config";

export const NOW = SIM_EPOCH;
export const at = (min: number) => NOW + min * MIN;

/** A flat, predictable model: every item takes exactly `min` minutes regardless of load. */
export function flatModel(min = 6): PrepModel {
  return {
    items: Object.fromEntries(MENU.map((m) => [m.id, { a: min, b: 0, peakFactor: 1, n: 0 }])),
    learnedFromOrders: 0,
    historyRecords: 0,
  };
}

export function dd(id: string, etaMin: number, items: Order["items"], extra: Partial<Order> = {}): Order {
  return { id, channel: "doordash", customerName: "C", dasherName: "Marcus", dasherEtaAt: at(etaMin), items, createdAt: at(-1), status: "queued", ...extra };
}

export function walk(id: string, items: Order["items"], extra: Partial<Order> = {}): Order {
  return { id, channel: "walkin", customerName: "W", items, createdAt: NOW, status: "queued", ...extra };
}

export const tacos = (qty = 1): Order["items"] => [{ menuItemId: "chicken_taco", qty }];
