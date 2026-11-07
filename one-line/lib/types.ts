// Shared data model for One Line. Teammates: import from "@/lib/types".
// Everything here is plain JSON, which is exactly what GET /api/state returns.

export type Channel = "walkin" | "doordash";
export type Station = "grill" | "fryer" | "cold" | "assembly";

export type MenuItem = {
  id: string; // "chicken_taco"
  name: string; // "Chicken Taco"
  station: Station;
  basePrepMin: number; // prep time on a quiet day
  holdMin: number; // how long it can sit once done before quality drops
  batchable: boolean; // can be cooked together with the same item from other orders
  holdPhrase?: string; // used in reasons: "fries would go soggy"
  plural?: string; // "Chicken Tacos" (defaults to name + "s")
};

export type OrderItem = { menuItemId: string; qty: number; mods?: string[] };

export type OrderStatus = "queued" | "cooking" | "ready" | "picked_up";

export type Priority = "late" | "start_now" | "upcoming" | "hold";

export type Order = {
  id: string; // "#212"
  channel: Channel;
  customerName: string;
  items: OrderItem[];
  notes?: string;
  createdAt: number; // sim time, ms
  dasherEtaAt?: number; // sim time the dasher arrives (doordash only)
  dasherName?: string;
  status: OrderStatus;
  // filled by scheduler:
  predictedPrepMin?: number; // includes the pack buffer
  startAt?: number; // when kitchen should start
  readyAt?: number; // predicted ready time
  priority?: Priority;
  reason?: string; // plain-language explanation
  batchId?: string;
  // extras (all optional):
  startedAt?: number; // when staff hit "Start cooking"
  readyAtActual?: number; // when staff hit "Mark ready"
  pickedUpAt?: number;
  shelf?: string; // pickup shelf, e.g. "B3" (assigned when cooking starts)
  flags?: string[]; // from note parsing, e.g. ["ALLERGY"]
  lateMin?: number; // how late the food will be (DoorDash) / how long the walk-in has waited
  pushedBackMin?: number; // delay caused by station capacity
  batchIds?: string[]; // all batches this order is part of (batchId = the first)
};

export type Batch = {
  id: string;
  menuItemId: string;
  totalQty: number;
  orderIds: string[];
  startAt: number;
  reason: string; // e.g. "Cook 5 Chicken Tacos together for #212, #214, #215"
  startedAt?: number; // set once the batch is on the grill (locked)
};

/** Shown for transparency: same item, but we chose not to batch it. */
export type NearMiss = {
  menuItemId: string;
  orderIds: [string, string];
  gapMin: number;
  reason: string; // "Not batched: #218 is 9 min later — tacos would sit too long."
};

/** Structured result of reading an order's notes (LLM or keyword rules). */
export type ParsedNotes = {
  extraPrepMin: number;
  cookSeparately: boolean;
  flags: string[];
  source: "llm" | "rules";
};

export type StationLoad = {
  station: Station;
  capacity: number;
  cookingNow: number; // items actually on the station right now
  plannedNow: number; // cooking + queued items the plan says should be on it now
};

export type ItemModel = {
  a: number; // minutes at zero load
  b: number; // extra minutes per concurrent order
  peakFactor: number; // multiplier on Fri/Sat evenings
  n: number; // number of observations
};

export type PrepModel = {
  items: Record<string, ItemModel>;
  learnedFromOrders: number;
  historyRecords: number;
};

export type ModelStats = {
  learnedFromOrders: number;
  historyRecords: number;
  lastLearned?: string; // "Chicken Taco: 7.8 → 7.5 min"
  items: { id: string; name: string; a: number; b: number; peakFactor: number }[];
};

export type SimInfo = {
  running: boolean;
  speed: number;
  rush: boolean;
  randomOrders: boolean;
  autoCook: boolean;
  scenario: string | null;
  llmEnabled: boolean;
};

/** Response of GET /api/state */
export type AppState = {
  simNow: number;
  orders: Order[]; // active orders (not picked up), sorted for the kitchen
  batches: Batch[];
  nearMisses: NearMiss[];
  stations: StationLoad[];
  modelStats: ModelStats;
  sim: SimInfo;
  menu: MenuItem[];
};
