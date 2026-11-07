// Order generator, dasher ETA drift, and the scripted demo scenario. Pure given an RNG.
import type { Channel, Order, OrderItem } from "./types";
import { CONFIG, MIN } from "./config";
import { gaussian, pick, randInt, type Rng } from "./rng";


const CUSTOMERS = ["Maya", "Jordan K.", "Sam R.", "Ana P.", "Chris", "Taylor M.", "Riley B.", "Casey L.", "Jamie", "Noor", "Eli", "Sofia G.", "Ben", "Hana T.", "Luis", "Grace W.", "Mo", "Ivy C.", "Andre", "Zoe"];
const DASHERS = ["Marcus", "Priya", "Leo", "Dev", "Kim", "Omar", "Nia", "Tomás", "Aisha", "Ray", "Lena", "Victor"];
const NOTES = ["extra crispy", "no onions", "no cilantro please", "nut allergy — cook separately", "sauce on the side", "gluten allergy, please use a clean pan", "well done", "no cheese"];

// Weighted toward tacos/fries so batching opportunities happen naturally.
const POPULAR = ["chicken_taco", "chicken_taco", "carnitas_taco", "carnitas_taco", "quesadilla", "burrito", "fries", "fries", "churros", "chips_guac", "side_salad", "horchata"];

export function randomItems(rng: Rng): OrderItem[] {
  const lines = randInt(rng, 1, 3);
  const items: OrderItem[] = [];
  for (let i = 0; i < lines; i++) {
    const id = pick(rng, POPULAR);
    const existing = items.find((x) => x.menuItemId === id);
    if (existing) existing.qty += 1;
    else items.push({ menuItemId: id, qty: rng() < 0.75 ? 1 : 2 });
  }
  return items;
}

export function makeOrder(rng: Rng, now: number, id: string, channel?: Channel, overrides: Partial<Order> = {}): Order {
  const ch: Channel = channel ?? (rng() < CONFIG.doordashShare ? "doordash" : "walkin");
  const [lo, hi] = CONFIG.dasherEtaMinRange;
  const order: Order = {
    id,
    channel: ch,
    customerName: pick(rng, CUSTOMERS),
    items: randomItems(rng),
    createdAt: now,
    status: "queued",
    ...(rng() < 0.22 ? { notes: pick(rng, NOTES) } : {}),
    ...(ch === "doordash" ? { dasherName: pick(rng, DASHERS), dasherEtaAt: now + (lo + rng() * (hi - lo)) * MIN } : {}),
  };
  return { ...order, ...overrides };
}

/** Dasher ETAs wander a little (traffic). Only for dashers who haven't arrived. */
export function driftEtas(orders: Order[], rng: Rng, now: number, dtMs: number): Order[] {
  const sd = 5000 * Math.sqrt(dtMs / MIN); // ~5 s of drift per sim-minute
  return orders.map((o) =>
    o.channel === "doordash" && o.dasherEtaAt !== undefined && o.dasherEtaAt > now && o.status !== "picked_up"
      ? { ...o, dasherEtaAt: Math.max(now, o.dasherEtaAt + gaussian(rng, 0.3 * sd, sd)) }
      : o,
  );
}

/**
 * Deterministic 3-minute demo (at 5x). Designed so that:
 *  - #202 + #203 (Chicken Tacos, starts ~2 min apart) → BATCHED
 *  - #206 + #207 (Quesadillas, starts ~9 min apart) → NOT batched (near-miss shown)
 *    …then "Dasher delayed +8" on #206 moves it down AND makes it batch with #207.
 *  - #204 (nut allergy) + #205 (Carnitas, close in time) → NOT batched (allergy)
 *  - #208 → HOLD (fries would go soggy), #209 → LATE (dasher almost here)
 */
export function demoScenario(now: number): Order[] {
  const at = (min: number) => now + min * MIN;
  const dd = (id: string, customerName: string, dasherName: string, etaMin: number, items: OrderItem[], notes?: string, createdAgoMin = 2): Order => ({
    id,
    channel: "doordash",
    customerName,
    dasherName,
    dasherEtaAt: at(etaMin),
    items,
    createdAt: at(-createdAgoMin),
    status: "queued",
    ...(notes ? { notes } : {}),
  });
  const walk = (id: string, customerName: string, items: OrderItem[], createdAgoMin = 0): Order => ({
    id,
    channel: "walkin",
    customerName,
    items,
    createdAt: at(-createdAgoMin),
    status: "queued",
  });
  return [
    walk("#201", "Maya", [{ menuItemId: "burrito", qty: 1 }, { menuItemId: "horchata", qty: 1 }], 0.3),
    dd("#202", "Jordan K.", "Marcus", 14, [{ menuItemId: "chicken_taco", qty: 3 }, { menuItemId: "chips_guac", qty: 1 }]),
    dd("#203", "Sam R.", "Priya", 16, [{ menuItemId: "chicken_taco", qty: 2 }, { menuItemId: "horchata", qty: 1 }]),
    dd("#204", "Ana P.", "Leo", 11, [{ menuItemId: "carnitas_taco", qty: 2 }], "nut allergy — cook separately"),
    walk("#205", "Chris", [{ menuItemId: "carnitas_taco", qty: 1 }, { menuItemId: "fries", qty: 1 }], 0.1),
    dd("#206", "Taylor M.", "Dev", 13, [{ menuItemId: "quesadilla", qty: 1 }, { menuItemId: "side_salad", qty: 1 }]),
    dd("#207", "Riley B.", "Kim", 22, [{ menuItemId: "quesadilla", qty: 1 }, { menuItemId: "side_salad", qty: 1 }]),
    dd("#208", "Casey L.", "Omar", 22, [{ menuItemId: "fries", qty: 2 }, { menuItemId: "churros", qty: 1 }], "extra crispy"),
    dd("#209", "Jamie", "Nia", 8, [{ menuItemId: "burrito", qty: 2 }], undefined, 6),
  ];
}

