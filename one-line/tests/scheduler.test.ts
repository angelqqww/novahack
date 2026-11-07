import { describe, expect, it } from "vitest";
import { applyCapacity, idealStartAt, priorityFor, reasonFor, sortQueue, type ScheduleUnit } from "@/lib/scheduler";
import { computeQueue } from "@/lib/engine";
import { MENU } from "@/lib/menu";
import { CONFIG, MIN } from "@/lib/config";
import { NOW, at, dd, flatModel, tacos, walk } from "./helpers";

const run = (orders: Parameters<typeof computeQueue>[0]["orders"], model = flatModel(6)) =>
  computeQueue({ now: NOW, orders, menu: MENU, model, notes: {} });

describe("idealStartAt", () => {
  it("DoorDash: dasher ETA minus predicted prep", () => {
    expect(idealStartAt(dd("#1", 15, tacos()), 8)).toBe(at(7));
  });
  it("walk-in: the moment they ordered", () => {
    expect(idealStartAt(walk("#2", tacos(), { createdAt: at(-2) }), 8)).toBe(at(-2));
  });
});

describe("priorityFor", () => {
  it("labels by minutes until start", () => {
    expect(priorityFor(at(0.5), at(0.5), NOW)).toBe("start_now");
    expect(priorityFor(at(3), at(3), NOW)).toBe("upcoming");
    expect(priorityFor(at(9), at(9), NOW)).toBe("hold");
  });
  it("late once the ideal start passed by more than the threshold", () => {
    expect(priorityFor(at(-0.5), at(-0.5), NOW)).toBe("start_now");
    expect(priorityFor(at(-3), at(-3), NOW)).toBe("late");
  });
});

describe("computeQueue (scheduler)", () => {
  it("DoorDash start = ETA − prep (prep includes the pack buffer)", () => {
    const [o] = run([dd("#1", 20, tacos())]).orders;
    expect(o.predictedPrepMin).toBeCloseTo(6 + CONFIG.packBufferMin);
    expect(o.startAt).toBe(at(20 - 8));
    expect(o.priority).toBe("hold");
    expect(o.reason).toMatch(/^Hold 12 min — dasher Marcus is 20 min away; tacos would get cold/);
  });

  it("start_now reason names the dasher and prep time", () => {
    const [o] = run([dd("#1", 8.5, tacos())]).orders;
    expect(o.priority).toBe("start_now");
    expect(o.reason).toBe("Start now — dasher Marcus arrives in 9 min, food takes 8.");
  });

  it("walk-ins start now with a counter reason", () => {
    const [o] = run([walk("#2", tacos())]).orders;
    expect(o.priority).toBe("start_now");
    expect(o.reason).toBe("Walk-in — customer waiting at counter.");
  });

  it("late orders say how late they'll be", () => {
    const [o] = run([dd("#3", 5, tacos())]).orders; // needs 8, dasher in 5
    expect(o.priority).toBe("late");
    expect(o.lateMin).toBeCloseTo(3);
    expect(o.reason).toMatch(/^Running 3 min late/);
  });

  it("sorts late → start_now → upcoming → hold", () => {
    const out = run([dd("#hold", 30, tacos()), walk("#now", [{ menuItemId: "burrito", qty: 1 }]), dd("#late", 4, [{ menuItemId: "quesadilla", qty: 1 }]), dd("#up", 11, [{ menuItemId: "fries", qty: 1 }])]);
    expect(out.orders.map((o) => o.priority)).toEqual(["late", "start_now", "upcoming", "hold"]);
  });

  it("re-plans when the dasher is delayed", () => {
    const before = run([dd("#1", 9, tacos())]).orders[0];
    const after = run([dd("#1", 17, tacos())]).orders[0];
    expect(before.priority).toBe("start_now");
    expect(after.priority).toBe("hold");
    expect(after.startAt! - before.startAt!).toBe(8 * MIN);
  });

  it("station capacity pushes later orders back and says so", () => {
    // Fryer fits 4. Two walk-ins with 3 fries each, cook separately → second must wait.
    const fries = [{ menuItemId: "fries", qty: 3 }];
    const notes = { "#b": { extraPrepMin: 0, cookSeparately: true, flags: [], source: "rules" as const } };
    const out = computeQueue({ now: NOW, orders: [walk("#a", fries), walk("#b", fries, { createdAt: NOW + 1 })], menu: MENU, model: flatModel(6), notes });
    const b = out.orders.find((o) => o.id === "#b")!;
    expect(b.pushedBackMin).toBeCloseTo(6);
    expect(b.reason).toMatch(/Pushed back 6 min — fryer is full/);
    expect(out.stations.find((s) => s.station === "fryer")!.plannedNow).toBe(3);
  });
});

describe("applyCapacity", () => {
  it("places a unit at the first time every station it needs has room", () => {
    const u = (id: string, qty: number, urgency: number): ScheduleUnit => ({ id, desiredAt: NOW, urgency, needs: [{ station: "grill", qty, durMin: 5 }] });
    const { units } = applyCapacity([u("a", 6, 0), u("b", 6, 1)], [], { grill: 10, fryer: 4, cold: 6, assembly: 3 });
    expect(units.find((x) => x.id === "a")!.startAt).toBe(NOW);
    expect(units.find((x) => x.id === "b")!.startAt).toBe(at(5));
    expect(units.find((x) => x.id === "b")!.blockedBy).toBe("grill");
  });
});

describe("reasonFor", () => {
  it("explains pushed-back DoorDash orders", () => {
    const r = reasonFor({ order: dd("#1", 20, tacos()), now: NOW, priority: "upcoming", startAt: at(4), predictedPrepMin: 8, pushedBackMin: 2, blockedBy: "fryer", lateMin: 0 });
    expect(r).toBe("Pushed back 2 min — fryer is full. Still ready before dasher Marcus arrives.");
  });
});

describe("sortQueue", () => {
  it("breaks ties by start time", () => {
    const s = sortQueue([{ id: "b", priority: "hold", startAt: 2 }, { id: "a", priority: "hold", startAt: 1 }]);
    expect(s.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
