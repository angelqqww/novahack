// ─────────────────────────────────────────────────────────────────────────────
// Pulse mock data — the ONLY source of data in the app.
// Swap this file (or src/data/api.ts, which wraps it) for a real API later.
// Everything is deterministic: the same date always produces the same numbers.
// ─────────────────────────────────────────────────────────────────────────────

export type Category = "Ramen" | "Sides" | "Rice" | "Drinks";

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: Category;
  /** The merchant's uploaded menu photo (served from /public/menu). */
  photo: string;
  /** Unsplash photo id, for credit. */
  photoCredit: string;
  prepMin: number;
  /** Share of orders that include this item (before time-of-day effects). */
  attach: number;
  /** Multipliers by daypart. */
  lunchLift?: number; // 11–14
  afternoonLift?: number; // 14–17
  lateLift?: number; // 21–23
  rainLift?: number;
  /** Item-specific weekly growth (e.g. 0.03 = +3%/week). */
  trendPerWeek?: number;
  ingredients: { id: string; qty: number }[];
};

export type Ingredient = { id: string; name: string; unit: string; parLevel: number; onHand: number; supplier: string };

/** One hour of one day. Day-of-week: 0 = Monday … 6 = Sunday. */
export type HourRecord = {
  date: string; // YYYY-MM-DD
  dow: number;
  hour: number; // 10 … 22 (10am–11pm)
  orders: number;
  revenue: number;
  prepMin: number; // average
  dashersWaiting: number; // average Dashers waiting at the counter
  items: Record<string, number>;
  rain: boolean;
  soldOut: string[]; // item ids unavailable during this hour
};

export type DayWeather = { date: string; dow: number; condition: "sun" | "cloud" | "rain"; highF: number };

export type LiveOrder = {
  id: string;
  customer: string;
  items: { itemId: string; qty: number }[];
  placedMinAgo: number;
  dasherEtaMin: number; // minutes until the Dasher arrives
  dasherName: string;
  status: "new" | "preparing";
};

// ── Store ────────────────────────────────────────────────────────────────────
export const STORE = {
  name: "Sakura Ramen House",
  address: "1120 Market St, San Francisco",
  openHour: 10,
  closeHour: 23,
  lineCooksBase: 2,
  ordersPerCookPerHour: 16,
};

export const HOURS = Array.from({ length: STORE.closeHour - STORE.openHour }, (_, i) => STORE.openHour + i); // 10..22
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ── Menu (photos verified, stored locally) ───────────────────────────────────
export const MENU: MenuItem[] = [
  { id: "tonkotsu", name: "Tonkotsu Ramen", price: 16.5, category: "Ramen", photo: "/menu/tonkotsu-ramen.jpg", photoCredit: "1614563637806-1d0e645e0940", prepMin: 9, attach: 0.34, rainLift: 1.22, ingredients: [{ id: "pork_belly", qty: 0.14 }, { id: "tonkotsu_broth", qty: 1 }, { id: "noodles", qty: 1 }, { id: "eggs", qty: 1 }, { id: "scallions", qty: 0.04 }] },
  { id: "spicy_miso", name: "Spicy Miso Ramen", price: 17, category: "Ramen", photo: "/menu/spicy-miso-ramen.jpg", photoCredit: "1607330289024-1535c6b4e1c1", prepMin: 9, attach: 0.22, rainLift: 1.1, trendPerWeek: 0.032, ingredients: [{ id: "ground_pork", qty: 0.15 }, { id: "miso", qty: 0.08 }, { id: "noodles", qty: 1 }, { id: "eggs", qty: 1 }, { id: "scallions", qty: 0.04 }] },
  { id: "shoyu", name: "Shoyu Ramen", price: 15, category: "Ramen", photo: "/menu/shoyu-ramen.jpg", photoCredit: "1557872943-16a5ac26437e", prepMin: 8, attach: 0.14, rainLift: 1.08, ingredients: [{ id: "pork_belly", qty: 0.12 }, { id: "chicken_broth", qty: 1 }, { id: "noodles", qty: 1 }, { id: "eggs", qty: 1 }] },
  { id: "black_garlic", name: "Black Garlic Ramen", price: 17.5, category: "Ramen", photo: "/menu/black-garlic-ramen.jpg", photoCredit: "1623341214825-9f4f963727da", prepMin: 10, attach: 0.12, rainLift: 1.1, lateLift: 1.3, trendPerWeek: 0.028, ingredients: [{ id: "pork_belly", qty: 0.14 }, { id: "tonkotsu_broth", qty: 1 }, { id: "noodles", qty: 1 }, { id: "eggs", qty: 1 }] },
  { id: "veggie_miso", name: "Veggie Miso Ramen", price: 15.5, category: "Ramen", photo: "/menu/veggie-miso-ramen.jpg", photoCredit: "1591814468924-caf88d1232e1", prepMin: 8, attach: 0.07, rainLift: 1.05, lunchLift: 1.3, ingredients: [{ id: "miso", qty: 0.08 }, { id: "noodles", qty: 1 }, { id: "bok_choy", qty: 0.12 }] },
  { id: "gyoza", name: "Pork Gyoza", price: 8, category: "Sides", photo: "/menu/gyoza.jpg", photoCredit: "1496116218417-1a781b1c416c", prepMin: 7, attach: 0.38, ingredients: [{ id: "gyoza", qty: 6 }] },
  { id: "karaage", name: "Chicken Karaage", price: 9.5, category: "Sides", photo: "/menu/karaage.jpg", photoCredit: "1569058242253-92a9c755a0ec", prepMin: 8, attach: 0.16, lateLift: 3.1, ingredients: [{ id: "chicken_thigh", qty: 0.35 }] },
  { id: "katsu", name: "Chicken Katsu", price: 13, category: "Rice", photo: "/menu/chicken-katsu.jpg", photoCredit: "1562967914-608f82629710", prepMin: 11, attach: 0.09, lunchLift: 1.3, trendPerWeek: -0.012, ingredients: [{ id: "chicken_thigh", qty: 0.4 }, { id: "rice", qty: 0.35 }] },
  { id: "chashu_bowl", name: "Chashu Bowl", price: 13.5, category: "Rice", photo: "/menu/chashu-bowl.jpg", photoCredit: "1609183480237-ccbb2d7c5772", prepMin: 6, attach: 0.12, ingredients: [{ id: "pork_belly", qty: 0.3 }, { id: "rice", qty: 0.35 }, { id: "eggs", qty: 1 }] },
  { id: "curry", name: "Japanese Curry Rice", price: 14, category: "Rice", photo: "/menu/curry-rice.jpg", photoCredit: "1593560704563-f176a2eb61db", prepMin: 7, attach: 0.045, lunchLift: 1.2, trendPerWeek: -0.022, ingredients: [{ id: "rice", qty: 0.35 }] },
  { id: "yuzu", name: "Yuzu Lemonade", price: 5, category: "Drinks", photo: "/menu/yuzu-lemonade.jpg", photoCredit: "1621263764928-df1444c5e859", prepMin: 2, attach: 0.17, lunchLift: 1.45, rainLift: 0.6, ingredients: [{ id: "yuzu", qty: 1.5 }] },
  { id: "matcha", name: "Matcha Latte", price: 5.5, category: "Drinks", photo: "/menu/matcha-latte.jpg", photoCredit: "1515823064-d6e0c04616a7", prepMin: 3, attach: 0.1, afternoonLift: 2.4, trendPerWeek: 0.018, ingredients: [{ id: "matcha", qty: 0.12 }] },
];

/** "Often ordered with" — share of this item's orders that also include the paired item. */
export const PAIRINGS: Record<string, { itemId: string; pct: number }[]> = {
  tonkotsu: [{ itemId: "gyoza", pct: 46 }, { itemId: "karaage", pct: 21 }, { itemId: "yuzu", pct: 18 }],
  spicy_miso: [{ itemId: "gyoza", pct: 41 }, { itemId: "yuzu", pct: 24 }, { itemId: "karaage", pct: 17 }],
  shoyu: [{ itemId: "gyoza", pct: 39 }, { itemId: "matcha", pct: 15 }, { itemId: "karaage", pct: 14 }],
  black_garlic: [{ itemId: "karaage", pct: 31 }, { itemId: "gyoza", pct: 30 }, { itemId: "yuzu", pct: 12 }],
  veggie_miso: [{ itemId: "yuzu", pct: 33 }, { itemId: "gyoza", pct: 22 }, { itemId: "matcha", pct: 19 }],
  gyoza: [{ itemId: "tonkotsu", pct: 52 }, { itemId: "spicy_miso", pct: 28 }, { itemId: "chashu_bowl", pct: 14 }],
  karaage: [{ itemId: "black_garlic", pct: 24 }, { itemId: "tonkotsu", pct: 22 }, { itemId: "yuzu", pct: 20 }],
  katsu: [{ itemId: "gyoza", pct: 27 }, { itemId: "yuzu", pct: 25 }, { itemId: "matcha", pct: 11 }],
  chashu_bowl: [{ itemId: "gyoza", pct: 44 }, { itemId: "karaage", pct: 19 }, { itemId: "matcha", pct: 12 }],
  curry: [{ itemId: "karaage", pct: 29 }, { itemId: "yuzu", pct: 22 }, { itemId: "gyoza", pct: 18 }],
  yuzu: [{ itemId: "spicy_miso", pct: 34 }, { itemId: "tonkotsu", pct: 31 }, { itemId: "katsu", pct: 15 }],
  matcha: [{ itemId: "shoyu", pct: 23 }, { itemId: "chashu_bowl", pct: 21 }, { itemId: "veggie_miso", pct: 17 }],
};

// ── Ingredients (par level = what you normally stock for a week) ─────────────
export const INGREDIENTS: Ingredient[] = [
  { id: "pork_belly", name: "Pork belly", unit: "lb", parLevel: 160, onHand: 38, supplier: "Golden Gate Meats" },
  { id: "tonkotsu_broth", name: "Tonkotsu broth", unit: "qt", parLevel: 650, onHand: 180, supplier: "Made in-house" },
  { id: "chicken_broth", name: "Chicken shoyu broth", unit: "qt", parLevel: 190, onHand: 60, supplier: "Made in-house" },
  { id: "noodles", name: "Fresh ramen noodles", unit: "portions", parLevel: 1200, onHand: 420, supplier: "Sun Noodle" },
  { id: "eggs", name: "Ajitama eggs", unit: "eggs", parLevel: 1250, onHand: 360, supplier: "Petaluma Farms" },
  { id: "ground_pork", name: "Ground pork", unit: "lb", parLevel: 42, onHand: 14, supplier: "Golden Gate Meats" },
  { id: "chicken_thigh", name: "Chicken thigh", unit: "lb", parLevel: 140, onHand: 46, supplier: "Golden Gate Meats" },
  { id: "gyoza", name: "Pork gyoza", unit: "pcs", parLevel: 2900, onHand: 900, supplier: "Made in-house" },
  { id: "miso", name: "Red miso paste", unit: "lb", parLevel: 30, onHand: 12, supplier: "Nijiya Market" },
  { id: "rice", name: "Short-grain rice", unit: "lb", parLevel: 120, onHand: 70, supplier: "Nijiya Market" },
  { id: "scallions", name: "Scallions", unit: "lb", parLevel: 30, onHand: 8, supplier: "Green Leaf Produce" },
  { id: "bok_choy", name: "Baby bok choy", unit: "lb", parLevel: 12, onHand: 4, supplier: "Green Leaf Produce" },
  { id: "yuzu", name: "Yuzu juice", unit: "oz", parLevel: 320, onHand: 150, supplier: "Nijiya Market" },
  { id: "matcha", name: "Ceremonial matcha", unit: "oz", parLevel: 18, onHand: 9, supplier: "Nijiya Market" },
];

// ── Deterministic randomness ─────────────────────────────────────────────────
function rngFor(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number, sd = 1) {
  return sd * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9))) * Math.cos(2 * Math.PI * r());
}

export const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;
const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// ── Demand shape ─────────────────────────────────────────────────────────────
const HOUR_CURVE: Record<number, number> = { 10: 0.22, 11: 0.62, 12: 1.0, 13: 0.88, 14: 0.42, 15: 0.3, 16: 0.34, 17: 0.62, 18: 0.98, 19: 1.0, 20: 0.66, 21: 0.34, 22: 0.18 };
const DOW_FACTOR = [0.6, 0.74, 0.8, 0.88, 1.24, 1.36, 1.02]; // Mon … Sun
const BASE_ORDERS_PER_PEAK_HOUR = 23;

function hourFactor(dow: number, hour: number) {
  let f = HOUR_CURVE[hour] ?? 0;
  const weekend = dow === 4 || dow === 5;
  if (weekend && (hour === 18 || hour === 19)) f *= 1.12;
  if (weekend && hour === 21) f *= 2.1; // late-night bump Fri/Sat 9–10pm
  if (weekend && hour === 22) f *= 1.7;
  return f;
}

export function isRainy(d: Date): boolean {
  const n = dayNumber(d);
  const r = rngFor(n * 7919 + 13)();
  return r < 0.16;
}

/** Item multiplier for a given hour. */
export function itemLift(item: MenuItem, hour: number, rain: boolean) {
  let m = 1;
  if (hour >= 11 && hour < 14) m *= item.lunchLift ?? 1;
  if (hour >= 14 && hour < 17) m *= item.afternoonLift ?? 1;
  if (hour >= 21) m *= item.lateLift ?? 1;
  if (rain) m *= item.rainLift ?? 1;
  return m;
}

function simulateDay(date: Date, weeksAgo: number, uptoHour = Infinity, uptoFraction = 1): HourRecord[] {
  const dow = mondayIndex(date);
  const n = dayNumber(date);
  const r = rngFor(n * 104729 + 7);
  const rain = isRainy(date);
  const growth = Math.pow(1.009, -weeksAgo); // ~0.9%/week growth
  const dayNoise = 1 + gauss(r, 0.06);
  // Chashu runs out most Saturdays by 8pm.
  const chashuOutAt = dow === 5 && r() < 0.78 ? 20 : dow === 4 && r() < 0.25 ? 21 : 99;
  const out: HourRecord[] = [];
  for (const hour of HOURS) {
    if (hour > uptoHour) break;
    const frac = hour === uptoHour ? uptoFraction : 1;
    const mean = BASE_ORDERS_PER_PEAK_HOUR * DOW_FACTOR[dow] * hourFactor(dow, hour) * growth * dayNoise * (rain ? 1.06 : 1) * (weeksAgo === 0 ? 1.11 : 1);
    const orders = Math.max(0, Math.round((mean * (1 + gauss(r, 0.11)) + gauss(r, 0.8)) * frac));
    const items: Record<string, number> = {};
    const soldOut: string[] = [];
    let revenue = 0;
    for (const item of MENU) {
      if (item.id === "chashu_bowl" && hour >= chashuOutAt) {
        items[item.id] = 0;
        soldOut.push(item.id);
        continue;
      }
      const itemTrend = Math.pow(1 + (item.trendPerWeek ?? 0), -weeksAgo);
      const expected = orders * item.attach * itemLift(item, hour, rain) * itemTrend;
      const count = Math.max(0, Math.round(expected * (1 + gauss(r, 0.15))));
      items[item.id] = count;
      revenue += count * item.price;
    }
    const prepMin = Math.round(((8.4 + orders * 0.17) * (weeksAgo === 0 ? 0.93 : 1) + gauss(r, 0.5)) * 10) / 10;
    const dashersWaiting = Math.max(0, Math.round(((orders - 16) / 6 + gauss(r, 0.4)) * 10) / 10);
    out.push({ date: toISODate(date), dow, hour, orders, revenue: Math.round(revenue * 100) / 100, prepMin, dashersWaiting, items, rain, soldOut });
  }
  return out;
}

/**
 * Hourly order history: `weeks` full weeks ending yesterday, plus today up to `now`.
 * Example: generateHistory(new Date(), 12)
 */
export function generateHistory(now: Date, weeks = 12): HourRecord[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const records: HourRecord[] = [];
  for (let back = weeks * 7; back >= 1; back--) {
    const d = addDays(today, -back);
    records.push(...simulateDay(d, back / 7));
  }
  const hourNow = now.getHours();
  const frac = now.getMinutes() / 60;
  if (hourNow >= STORE.openHour) records.push(...simulateDay(today, 0, Math.min(hourNow, STORE.closeHour - 1), hourNow >= STORE.closeHour ? 1 : frac));
  return records;
}

/** Next 7 days of weather. Thursday is rainy in the demo. */
export function weatherForecast(now: Date): DayWeather[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i + 1);
    const dow = mondayIndex(d);
    const r = rngFor(dayNumber(d) * 31 + 5)();
    const condition: DayWeather["condition"] = dow === 3 ? "rain" : r < 0.35 ? "cloud" : "sun";
    return { date: toISODate(d), dow, condition, highF: Math.round(58 + r * 12 - (condition === "rain" ? 6 : 0)) };
  });
}

// ── Live orders on the tablet right now ──────────────────────────────────────
const FIRST_NAMES = ["Maya", "Jordan", "Priya", "Leo", "Sofia", "Ethan", "Hana", "Marcus", "Ava", "Diego", "Noah", "Grace"];
const DASHERS = ["Andre", "Kim", "Luis", "Tasha", "Omar", "Bea", "Ray", "Nia", "Sam", "Ivy", "Theo", "Jun"];

export function liveOrders(now: Date): LiveOrder[] {
  const r = rngFor(dayNumber(now) * 17 + now.getHours());
  const baskets: { itemId: string; qty: number }[][] = [
    [{ itemId: "tonkotsu", qty: 2 }, { itemId: "gyoza", qty: 1 }],
    [{ itemId: "chashu_bowl", qty: 1 }, { itemId: "matcha", qty: 1 }],
    [{ itemId: "spicy_miso", qty: 1 }, { itemId: "yuzu", qty: 1 }],
    [{ itemId: "katsu", qty: 1 }, { itemId: "karaage", qty: 1 }],
    [{ itemId: "tonkotsu", qty: 1 }, { itemId: "karaage", qty: 1 }],
    [{ itemId: "gyoza", qty: 2 }],
    [{ itemId: "black_garlic", qty: 1 }, { itemId: "gyoza", qty: 1 }, { itemId: "yuzu", qty: 2 }],
    [{ itemId: "veggie_miso", qty: 1 }],
    [{ itemId: "shoyu", qty: 1 }, { itemId: "tonkotsu", qty: 1 }, { itemId: "gyoza", qty: 1 }],
  ];
  const etas = [8, 21, 12, 12, 7, 3, 21, 26, 20];
  const placed = [6, 2, 5, 3, 4, 7, 1, 1, 2];
  return baskets.map((items, i) => ({
    id: (0x3a7f1 + i * 0x2b9 + Math.floor(r() * 16)).toString(16).toUpperCase().slice(-4),
    customer: FIRST_NAMES[i],
    items,
    placedMinAgo: placed[i],
    dasherEtaMin: etas[i],
    dasherName: DASHERS[i],
    status: placed[i] >= 5 ? "preparing" : "new",
  }));
}

export const PHOTO_CREDIT_NOTE = "Food photography from Unsplash (unsplash.com/photos/<id>), used under the Unsplash License.";
