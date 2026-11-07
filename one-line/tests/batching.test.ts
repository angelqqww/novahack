import { describe, expect, it } from "vitest";
import { canBatch, findBatches } from "@/lib/batching";
import { computeQueue } from "@/lib/engine";
import { MENU, MENU_BY_ID } from "@/lib/menu";
import { CONFIG } from "@/lib/config";
import { parseNotesRules } from "@/lib/notes";
import type { Order } from "@/lib/types";
import { NOW, at, dd, flatModel, tacos } from "./helpers";

const queued = (id: string, startMin: number, items = tacos(2), extra: Partial<Order> = {}): Order => ({
  ...dd(id, startMin + 8, items, extra),
  startAt: at(startMin),
});

describe("canBatch", () => {
  const taco = MENU_BY_ID.chicken_taco;
  it("ok within the window", () => expect(canBatch({ startAt: at(0) }, { startAt: at(2) }, taco).ok).toBe(true));
  it("not ok outside the window", () => expect(canBatch({ startAt: at(0) }, { startAt: at(9) }, taco).ok).toBe(false));
  it("window is capped by the item's hold time", () => {
    const fries = MENU_BY_ID.fries; // holds 3
    expect(canBatch({ startAt: at(0) }, { startAt: at(3) }, fries, undefined, undefined, { batchWindowMin: 10 }).ok).toBe(true);
    expect(canBatch({ startAt: at(0) }, { startAt: at(4) }, fries, undefined, undefined, { batchWindowMin: 10 }).ok).toBe(false);
  });
  it("never for non-batchable items or cook-separately notes", () => {
    expect(canBatch({ startAt: at(0) }, { startAt: at(0) }, MENU_BY_ID.burrito).ok).toBe(false);
    expect(canBatch({ startAt: at(0) }, { startAt: at(0) }, taco, { cookSeparately: true }).ok).toBe(false);
  });
});

describe("findBatches", () => {
  it("same item 2 min apart → batched, starting at the earliest member", () => {
    const { batches } = findBatches([queued("#212", 0), queued("#214", 2)], MENU, {});
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ menuItemId: "chicken_taco", totalQty: 4, orderIds: ["#212", "#214"], startAt: at(0) });
    expect(batches[0].reason).toMatch(/^Cook 4 Chicken Tacos together for #212, #214/);
  });

  it("same item 9 min apart → not batched, with a near-miss reason", () => {
    const { batches, nearMisses } = findBatches([queued("#212", 0), queued("#218", 9)], MENU, {});
    expect(batches).toHaveLength(0);
    expect(nearMisses).toHaveLength(1);
    expect(nearMisses[0].reason).toBe("Not batched: #218 is 9 min after #212 — tacos would get cold (holds 6 min).");
  });

  it("allergy note → not batched", () => {
    const notes = { "#214": parseNotesRules("nut allergy — cook separately") };
    const { batches, nearMisses } = findBatches([queued("#212", 0), queued("#214", 1, tacos(2), { notes: "nut allergy — cook separately" })], MENU, notes);
    expect(batches).toHaveLength(0);
    expect(nearMisses[0].reason).toMatch(/#214 has an allergy/);
  });

  it("three close orders join one batch; a fourth outside the window starts a new group", () => {
    const { batches } = findBatches([queued("#1", 0, tacos(1)), queued("#2", 1, tacos(1)), queued("#3", 3, tacos(1)), queued("#4", 4, tacos(1)), queued("#5", 5, tacos(1))], MENU, {});
    expect(batches.map((b) => b.orderIds)).toEqual([["#1", "#2", "#3"], ["#4", "#5"]]);
  });

  it("never grows a batch past the station's capacity", () => {
    const cap = CONFIG.stationCapacity.fryer;
    const fries = (q: number) => [{ menuItemId: "fries", qty: q }];
    const { batches, nearMisses } = findBatches([queued("#1", 0, fries(3)), queued("#2", 0.5, fries(3))], MENU, {});
    expect(3 + 3).toBeGreaterThan(cap);
    expect(batches).toHaveLength(0);
    expect(nearMisses[0].reason).toMatch(/fryer fits only/);
  });

  it("does not batch an order with itself", () => {
    const { batches } = findBatches([queued("#1", 0, [{ menuItemId: "chicken_taco", qty: 1 }, { menuItemId: "chicken_taco", qty: 2 }])], MENU, {});
    expect(batches).toHaveLength(0);
  });
});

describe("batching never makes an order later than its own start", () => {
  it("holds for every member across many random layouts", () => {
    let seed = 1;
    let formed = 0;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 200; trial++) {
      const orders = Array.from({ length: 6 }, (_, i) => dd(`#${i}`, 8 + rnd() * 12, [{ menuItemId: rnd() < 0.5 ? "chicken_taco" : "carnitas_taco", qty: 1 }]));
      const out = computeQueue({ now: NOW, orders, menu: MENU, model: flatModel(6), notes: {} });
      formed += out.batches.length;
      for (const b of out.batches) {
        for (const id of b.orderIds) {
          const o = out.orders.find((x) => x.id === id)!;
          expect(b.startAt).toBeLessThanOrEqual(o.startAt!);
          // and the early portion never sits longer than the item can hold
          expect((o.startAt! - b.startAt) / 60_000).toBeLessThanOrEqual(MENU_BY_ID[b.menuItemId].holdMin + 1e-9);
        }
      }
    }
    expect(formed).toBeGreaterThan(50);
  });
});

describe("batches that don't fit are broken up", () => {
  it("cooks portions separately when a batch would be pushed back by station capacity", () => {
    // Fryer fits 4 and already has 3 churros cooking. #a needs 1 fry now, #b 2 fries a minute later.
    // Batched (3 fries) they'd wait for the churros; separately #a fits right away.
    const cooking = { ...dd("#c", 30, [{ menuItemId: "churros", qty: 3 }]), status: "cooking" as const, startedAt: NOW };
    const out = computeQueue({
      now: NOW,
      orders: [cooking, walkIn("#a", [{ menuItemId: "fries", qty: 1 }]), walkIn("#b", [{ menuItemId: "fries", qty: 2 }], 1)],
      menu: MENU,
      model: flatModel(6),
      notes: {},
    });
    expect(out.batches.filter((b) => !b.startedAt)).toHaveLength(0);
    expect(out.orders.find((o) => o.id === "#a")!.pushedBackMin).toBeUndefined();
    expect(out.nearMisses.some((n) => /fryer has no room/.test(n.reason))).toBe(true);
  });
});

function walkIn(id: string, items: Order["items"], createdAfterMin = 0): Order {
  return { id, channel: "walkin", customerName: "W", items, createdAt: at(createdAfterMin), status: "queued" };
}
