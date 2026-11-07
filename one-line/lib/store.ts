// The ONLY stateful module: an in-memory singleton shared by every API route.
// Stored on globalThis so Next.js dev reloads and separate route bundles share one instance.
import type { AppState, Batch, Channel, Order, OrderStatus, ParsedNotes, PrepModel } from "./types";
import { CONFIG, MIN, SIM_EPOCH } from "./config";
import { MENU, MENU_BY_ID } from "./menu";
import { makeRng, gaussian, type Rng } from "./rng";
import { generateHistory, learnFromOrder, trainModel } from "./prepModel";
import { computeQueue, kitchenLoad, whenOf, type EngineOutput } from "./engine";
import { demoScenario, driftEtas, makeOrder } from "./simulator";
import { parseNotesRules } from "./notes";
import { llmEnabled, parseNotesLLM } from "./llm";

type Store = {
  simNow: number;
  lastWall: number;
  running: boolean;
  speed: number;
  rush: boolean;
  randomOrders: boolean;
  autoCook: boolean;
  drift: boolean;
  scenario: string | null;
  orders: Order[];
  notes: Record<string, ParsedNotes>;
  lockedBatches: Batch[];
  model: PrepModel;
  lastLearned?: string;
  loadAtStart: Record<string, number>;
  trueCookMin: Record<string, number>; // auto-cook only: how long this order "really" takes
  nextOrderAt: number;
  nextId: number;
  rng: Rng;
  plan: EngineOutput;
  epoch: number; // bumps on reset so in-flight LLM calls from an old run are ignored
};

const SHELVES = ["A", "B", "C"].flatMap((r) => [1, 2, 3, 4].map((n) => `${r}${n}`));

let trainedCache: PrepModel | undefined;
function freshModel(): PrepModel {
  trainedCache ??= trainModel(generateHistory(MENU), MENU);
  return structuredClone(trainedCache);
}

function freshStore(epoch = 0): Store {
  const s: Store = {
    simNow: SIM_EPOCH,
    lastWall: Date.now(),
    running: false,
    speed: CONFIG.simSpeedDefault,
    rush: false,
    randomOrders: false,
    autoCook: false,
    drift: true,
    scenario: null,
    orders: [],
    notes: {},
    lockedBatches: [],
    model: freshModel(),
    loadAtStart: {},
    trueCookMin: {},
    nextOrderAt: SIM_EPOCH + CONFIG.orderIntervalSec * 1000,
    nextId: 210,
    rng: makeRng(7),
    plan: { orders: [], batches: [], nearMisses: [], stations: [], load: 0 },
    epoch,
  };
  s.plan = plan(s);
  return s;
}

const g = globalThis as unknown as { __oneLineStore?: Store };
function store(): Store {
  g.__oneLineStore ??= freshStore();
  return g.__oneLineStore;
}

function plan(s: Store): EngineOutput {
  return computeQueue({ now: s.simNow, orders: s.orders, menu: MENU, model: s.model, notes: s.notes, lockedBatches: s.lockedBatches });
}

function replan(s: Store) {
  s.plan = plan(s);
}

// ---------------------------------------------------------------- clock

function advance(s: Store) {
  const wall = Date.now();
  const dtWall = Math.min(wall - s.lastWall, CONFIG.maxStepWallMs);
  s.lastWall = wall;
  if (!s.running || dtWall <= 0) return;
  const dt = dtWall * s.speed;
  s.simNow += dt;

  if (s.randomOrders) {
    while (s.simNow >= s.nextOrderAt) {
      insertOrder(s, makeOrder(s.rng, s.nextOrderAt, nextId(s)));
      s.nextOrderAt += nextGapMs(s);
    }
  } else {
    s.nextOrderAt = s.simNow + nextGapMs(s);
  }
  if (s.drift) s.orders = driftEtas(s.orders, s.rng, s.simNow, dt);

  autoPickup(s);
  replan(s);
  if (s.autoCook) {
    autoCook(s);
    replan(s);
  }
}

const nextGapMs = (s: Store) => (CONFIG.orderIntervalSec * 1000 * (0.5 + s.rng())) / (s.rush ? CONFIG.rushMultiplier : 1);
const nextId = (s: Store) => `#${s.nextId++}`;

function autoPickup(s: Store) {
  for (const o of s.orders) {
    if (o.status !== "ready") continue;
    const dasherHere = o.channel === "doordash" && (o.dasherEtaAt ?? 0) <= s.simNow;
    const walkinDone = o.channel === "walkin" && (o.readyAtActual ?? 0) + CONFIG.walkinPickupAfterMin * MIN <= s.simNow;
    if (dasherHere || walkinDone) {
      o.status = "picked_up";
      o.pickedUpAt = s.simNow;
    }
  }
  const active = new Set(s.orders.filter((o) => o.status === "queued" || o.status === "cooking").map((o) => o.id));
  s.lockedBatches = s.lockedBatches.filter((b) => b.orderIds.some((id) => active.has(id)));
  // Keep memory bounded on long runs.
  if (s.orders.length > 400) s.orders = s.orders.filter((o) => o.status !== "picked_up" || s.simNow - (o.pickedUpAt ?? 0) < 30 * MIN);
}

/** "Robot kitchen" for unattended runs: start orders when the plan says so, finish them after a noisy true time. */
function autoCook(s: Store) {
  for (const o of s.plan.orders) {
    if (o.status === "queued" && (o.priority === "start_now" || o.priority === "late") && (o.pushedBackMin ?? 0) < 0.5) {
      setStatusInternal(s, o.id, "cooking");
    }
  }
  for (const o of s.orders) {
    if (o.status !== "cooking" || o.startedAt === undefined) continue;
    s.trueCookMin[o.id] ??= (o.predictedPrepMin ?? 8) * 1.08 * Math.exp(gaussian(s.rng, 0, 0.15));
    if (s.simNow >= o.startedAt + s.trueCookMin[o.id] * MIN) setStatusInternal(s, o.id, "ready");
  }
}

// ---------------------------------------------------------------- mutations

function insertOrder(s: Store, order: Order) {
  const parsed = parseNotesRules(order.notes);
  s.notes[order.id] = parsed;
  s.orders.push({ ...order, flags: parsed.flags });
  if (order.notes && llmEnabled()) {
    const epoch = s.epoch;
    parseNotesLLM(order.notes)
      .then((p) => {
        const cur = store();
        if (cur.epoch !== epoch || !p) return;
        cur.notes[order.id] = p;
        const o = cur.orders.find((x) => x.id === order.id);
        if (o) o.flags = p.flags;
        replan(cur);
      })
      .catch(() => {});
  }
}

function setStatusInternal(s: Store, id: string, status: OrderStatus): Order | undefined {
  const o = s.orders.find((x) => x.id === id);
  if (!o) return undefined;
  const planned = s.plan.orders.find((x) => x.id === id);

  if (status === "cooking" && o.status === "queued") {
    o.status = "cooking";
    o.startedAt = s.simNow;
    o.predictedPrepMin = planned?.predictedPrepMin ?? o.predictedPrepMin;
    s.loadAtStart[id] = kitchenLoad(s.orders);
    if (o.channel === "doordash") o.shelf ??= freeShelf(s);
    // Any batch this order is in is now on the station.
    for (const b of s.plan.batches.filter((b) => !b.startedAt && b.orderIds.includes(id))) lockBatch(s, b);
  } else if (status === "ready" && (o.status === "cooking" || o.status === "queued")) {
    if (o.status === "queued") o.startedAt = s.simNow - (planned?.predictedPrepMin ?? 8) * MIN;
    o.status = "ready";
    o.readyAtActual = s.simNow;
    if (o.channel === "doordash") o.shelf ??= freeShelf(s);
    learn(s, o);
  } else if (status === "picked_up" && o.status !== "picked_up") {
    o.status = "picked_up";
    o.pickedUpAt = s.simNow;
  } else if (status === "queued") {
    o.status = "queued";
    o.startedAt = undefined;
  }
  return o;
}

function lockBatch(s: Store, b: Batch) {
  if (s.lockedBatches.some((x) => x.id === b.id)) return;
  s.lockedBatches.push({ ...b, startedAt: s.simNow });
  // Members whose every item is now cooking in a batch are, in effect, cooking.
  const lockedKeys = new Set(s.lockedBatches.flatMap((lb) => lb.orderIds.map((oid) => `${oid}|${lb.menuItemId}`)));
  for (const oid of b.orderIds) {
    const m = s.orders.find((x) => x.id === oid);
    if (m?.status === "queued" && m.items.every((l) => lockedKeys.has(`${oid}|${l.menuItemId}`))) {
      setStatusInternal(s, oid, "cooking");
    }
  }
}

function learn(s: Store, o: Order) {
  if (o.startedAt === undefined || o.readyAtActual === undefined) return;
  const actual = (o.readyAtActual - o.startedAt) / MIN;
  const load = s.loadAtStart[o.id] ?? kitchenLoad(s.orders);
  const r = learnFromOrder(s.model, o, load, actual, { extraPrepMin: s.notes[o.id]?.extraPrepMin ?? 0, when: whenOf(o.startedAt) });
  s.model = r.model;
  if (r.itemId && r.before !== undefined && r.after !== undefined) {
    s.lastLearned = `${MENU_BY_ID[r.itemId]?.name}: ${r.before.toFixed(1)} → ${r.after.toFixed(1)} min (${o.id} took ${actual < 1 ? "<1" : actual.toFixed(1)} min)`;
  }
}

function freeShelf(s: Store): string {
  const used = new Set(s.orders.filter((o) => o.status !== "picked_up" && o.shelf).map((o) => o.shelf));
  return SHELVES.find((x) => !used.has(x)) ?? "Counter";
}

// ---------------------------------------------------------------- public API

export function getState(): AppState {
  const s = store();
  advance(s);
  replan(s);
  return snapshot(s);
}

function snapshot(s: Store): AppState {
  return {
    simNow: s.simNow,
    orders: s.plan.orders,
    batches: s.plan.batches,
    nearMisses: s.plan.nearMisses,
    stations: s.plan.stations,
    modelStats: {
      learnedFromOrders: s.model.learnedFromOrders,
      historyRecords: s.model.historyRecords,
      lastLearned: s.lastLearned,
      items: MENU.map((m) => ({ id: m.id, name: m.name, a: s.model.items[m.id].a, b: s.model.items[m.id].b, peakFactor: s.model.items[m.id].peakFactor })),
    },
    sim: { running: s.running, speed: s.speed, rush: s.rush, randomOrders: s.randomOrders, autoCook: s.autoCook, scenario: s.scenario, llmEnabled: llmEnabled() },
    menu: MENU,
  };
}

export type NewOrderInput = Partial<Pick<Order, "customerName" | "items" | "notes" | "dasherName">> & {
  channel?: Channel;
  dasherEtaMin?: number;
};

export function addOrder(input: NewOrderInput = {}): Order {
  const s = store();
  advance(s);
  const base = makeOrder(s.rng, s.simNow, nextId(s), input.channel);
  const order: Order = {
    ...base,
    ...(input.customerName ? { customerName: input.customerName } : {}),
    ...(input.items?.length ? { items: input.items } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || undefined } : {}),
    ...(base.channel === "doordash" && input.dasherName ? { dasherName: input.dasherName } : {}),
    ...(base.channel === "doordash" && input.dasherEtaMin !== undefined ? { dasherEtaAt: s.simNow + input.dasherEtaMin * MIN } : {}),
  };
  insertOrder(s, order);
  replan(s);
  return order;
}

export function setStatus(id: string, status: OrderStatus): Order | undefined {
  const s = store();
  advance(s);
  replan(s);
  const o = setStatusInternal(s, id, status);
  replan(s);
  return o;
}

export function startBatch(batchId: string): boolean {
  const s = store();
  advance(s);
  replan(s);
  const b = s.plan.batches.find((x) => x.id === batchId && !x.startedAt);
  if (!b) return false;
  lockBatch(s, b);
  replan(s);
  return true;
}

export function delayDasher(id: string, minutes = 8): Order | undefined {
  const s = store();
  advance(s);
  const o = s.orders.find((x) => x.id === id);
  if (!o || o.channel !== "doordash" || o.dasherEtaAt === undefined) return undefined;
  o.dasherEtaAt += minutes * MIN;
  replan(s);
  return o;
}

export type SimAction =
  | { action: "start" }
  | { action: "pause" }
  | { action: "speed"; speed: number }
  | { action: "rush"; on: boolean }
  | { action: "random"; on: boolean }
  | { action: "autocook"; on: boolean }
  | { action: "scenario"; name?: string }
  | { action: "reset" };

export function simControl(a: SimAction): AppState {
  let s = store();
  advance(s);
  switch (a.action) {
    case "start":
      s.running = true;
      s.lastWall = Date.now();
      break;
    case "pause":
      s.running = false;
      break;
    case "speed":
      if (Number.isFinite(a.speed) && a.speed > 0 && a.speed <= 60) s.speed = a.speed;
      break;
    case "rush":
      s.rush = a.on;
      if (a.on) {
        s.randomOrders = true;
        s.running = true;
        for (let i = 0; i < CONFIG.rushBurstOrders; i++) insertOrder(s, makeOrder(s.rng, s.simNow - i * 15_000, nextId(s)));
      }
      s.nextOrderAt = s.simNow + nextGapMs(s);
      break;
    case "random":
      s.randomOrders = a.on;
      s.nextOrderAt = s.simNow + nextGapMs(s);
      break;
    case "autocook":
      s.autoCook = a.on;
      break;
    case "scenario": {
      s = g.__oneLineStore = freshStore(s.epoch + 1);
      s.scenario = a.name ?? "demo";
      s.drift = false; // deterministic
      s.running = true;
      for (const o of demoScenario(s.simNow)) insertOrder(s, o);
      break;
    }
    case "reset": {
      s = g.__oneLineStore = freshStore(s.epoch + 1);
      break;
    }
  }
  replan(s);
  return snapshot(s);
}

/** Used by teammates' pages (e.g. dasher check-in) that need one order. */
export function getOrder(id: string): Order | undefined {
  return getState().orders.find((o) => o.id === id) ?? store().orders.find((o) => o.id === id);
}
