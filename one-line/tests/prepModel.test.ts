import { describe, expect, it } from "vitest";
import { generateHistory, learnFromOrder, predictItemMin, predictOrderMin, trainModel } from "@/lib/prepModel";
import { MENU } from "@/lib/menu";
import { CONFIG } from "@/lib/config";

const history = generateHistory(MENU);
const model = trainModel(history, MENU);

describe("prep model", () => {
  it("generates ~30 days of history", () => {
    expect(history.length).toBeGreaterThan(3000);
    expect(new Set(history.map((r) => r.dow)).size).toBe(7);
  });

  it("learns that prep grows with load and on Fri/Sat evenings", () => {
    for (const m of MENU) {
      expect(model.items[m.id].b).toBeGreaterThan(0);
      expect(model.items[m.id].peakFactor).toBeGreaterThan(1.03);
    }
    expect(predictItemMin(model, "chicken_taco", 10)).toBeGreaterThan(predictItemMin(model, "chicken_taco", 0));
    expect(predictItemMin(model, "chicken_taco", 5, { hour: 19, dow: 5 })).toBeGreaterThan(predictItemMin(model, "chicken_taco", 5, { hour: 19, dow: 2 }));
  });

  it("recovers roughly the base prep time at zero load", () => {
    for (const m of MENU) expect(model.items[m.id].a).toBeGreaterThan(m.basePrepMin * 0.8);
  });

  it("order prep = slowest item + pack buffer", () => {
    const order = { items: [{ menuItemId: "horchata", qty: 1 }, { menuItemId: "quesadilla", qty: 1 }] };
    expect(predictOrderMin(model, order, 4, MENU)).toBeCloseTo(predictItemMin(model, "quesadilla", 4) + CONFIG.packBufferMin);
  });

  it("online learning nudges the bottleneck item toward the actual time and counts the order", () => {
    const order = { items: [{ menuItemId: "chicken_taco", qty: 2 }] };
    const predicted = predictOrderMin(model, order, 4, MENU);
    const r = learnFromOrder(model, order, 4, predicted + 2);
    expect(r.itemId).toBe("chicken_taco");
    expect(r.after!).toBeGreaterThan(r.before!);
    expect(r.after! - r.before!).toBeCloseTo(CONFIG.learnAlpha * 2);
    expect(r.model.learnedFromOrders).toBe(1);
    expect(model.learnedFromOrders).toBe(0); // pure: original untouched
  });
});
