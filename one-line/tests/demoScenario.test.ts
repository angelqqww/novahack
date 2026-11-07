import { describe, expect, it } from "vitest";
import { computeQueue } from "@/lib/engine";
import { demoScenario } from "@/lib/simulator";
import { generateHistory, trainModel } from "@/lib/prepModel";
import { parseNotesRules } from "@/lib/notes";
import { MENU } from "@/lib/menu";
import { MIN, SIM_EPOCH } from "@/lib/config";

// Guards the scripted demo against tuning changes (it uses the real trained model).
const model = trainModel(generateHistory(MENU), MENU);
const plan = (orders = demoScenario(SIM_EPOCH)) =>
  computeQueue({ now: SIM_EPOCH, orders, menu: MENU, model, notes: Object.fromEntries(orders.map((o) => [o.id, parseNotesRules(o.notes)])) });

describe("demo scenario", () => {
  const out = plan();
  const ids = (b: { orderIds: string[] }) => b.orderIds.join(",");

  it("batches the 2-min-apart taco pair", () => expect(out.batches.map(ids)).toContain("#202,#203"));
  it("does not batch the 9-min-apart quesadilla pair, and says why", () => {
    expect(out.batches.map(ids)).not.toContain("#206,#207");
    expect(out.nearMisses.some((n) => n.orderIds.join(",") === "#206,#207" && /9 min after/.test(n.reason))).toBe(true);
  });
  it("does not batch the allergy order", () => expect(out.nearMisses.some((n) => /#204 has an allergy/.test(n.reason))).toBe(true));
  it("shows every priority", () => {
    expect(new Set(out.orders.map((o) => o.priority))).toEqual(new Set(["late", "start_now", "upcoming", "hold"]));
  });
  it("dasher delayed +8 on #206 moves it down and batches it with #207", () => {
    const orders = demoScenario(SIM_EPOCH).map((o) => (o.id === "#206" ? { ...o, dasherEtaAt: o.dasherEtaAt! + 8 * MIN } : o));
    const after = plan(orders);
    const pos = (p: typeof out, id: string) => p.orders.findIndex((o) => o.id === id);
    expect(pos(after, "#206")).toBeGreaterThan(pos(out, "#206"));
    expect(after.orders.find((o) => o.id === "#206")!.priority).toBe("hold");
    expect(after.batches.map(ids)).toContain("#206,#207");
  });
});
