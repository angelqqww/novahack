// PURE: batch the same batchable item across orders when their start times are close.
import type { Batch, MenuItem, NearMiss, Order, ParsedNotes } from "./types";
import { CONFIG, MIN, type Config } from "./config";
import { itemLabel, menuIndex, pluralName } from "./menu";

type Slot = { startAt: number };

/** Can instances of `item` from orders A and B share one batch? */
export function canBatch(
  a: Slot,
  b: Slot,
  item: MenuItem,
  notesA?: Pick<ParsedNotes, "cookSeparately">,
  notesB?: Pick<ParsedNotes, "cookSeparately">,
  cfg: Pick<Config, "batchWindowMin"> = CONFIG,
): { ok: boolean; why: string } {
  if (!item.batchable) return { ok: false, why: `${item.name} is made to order` };
  if (notesA?.cookSeparately || notesB?.cookSeparately) return { ok: false, why: "order notes say cook separately" };
  const window = Math.min(cfg.batchWindowMin, item.holdMin);
  const gap = Math.abs(a.startAt - b.startAt) / MIN;
  if (gap > window) return { ok: false, why: `${fmtGap(gap)} min apart — ${sitWhy(item, gap, cfg.batchWindowMin)}` };
  return { ok: true, why: `${gap.toFixed(1)} min apart, within ${window} min window` };
}

type Candidate = { order: Order; qty: number; startAt: number; separate: boolean };

/**
 * Group the same item across orders. Greedy per item, sorted by start time:
 * a candidate joins the open group if it is within the window of the group's FIRST (earliest) member,
 * so the batch can start at the earliest start and nobody is made later than their own start.
 * Orders must already have `startAt` (the scheduler's ideal start).
 * `exclude` holds "orderId|menuItemId" keys that are already cooking in a locked batch.
 */
export function findBatches(
  orders: Order[],
  menu: MenuItem[],
  notes: Record<string, ParsedNotes | undefined>,
  cfg: Config = CONFIG,
  opts: { exclude?: Set<string> } = {},
): { batches: Batch[]; nearMisses: NearMiss[] } {
  const byId = menuIndex(menu);
  const batches: Batch[] = [];
  const nearMisses: NearMiss[] = [];

  // Collect candidates per item (merge duplicate lines of the same item within one order).
  const perItem = new Map<string, Candidate[]>();
  for (const order of orders) {
    if (order.status !== "queued" || order.startAt === undefined) continue;
    const separate = !!notes[order.id]?.cookSeparately;
    const qtyByItem = new Map<string, number>();
    for (const line of order.items) {
      const item = byId[line.menuItemId];
      if (!item?.batchable) continue;
      if (opts.exclude?.has(`${order.id}|${line.menuItemId}`)) continue;
      qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.qty);
    }
    for (const [itemId, qty] of qtyByItem) {
      const list = perItem.get(itemId) ?? [];
      list.push({ order, qty, startAt: order.startAt, separate });
      perItem.set(itemId, list);
    }
  }

  for (const [itemId, cands] of perItem) {
    const item = byId[itemId];
    const cap = cfg.stationCapacity[item.station];
    cands.sort((x, y) => x.startAt - y.startAt || x.order.id.localeCompare(y.order.id));

    // Allergy / cook-separately orders never join; explain if a neighbour was close.
    for (const c of cands.filter((c) => c.separate)) {
      const neighbour = cands.find(
        (o) => o !== c && !o.separate && Math.abs(o.startAt - c.startAt) / MIN <= Math.min(cfg.batchWindowMin, item.holdMin),
      );
      if (neighbour) {
        nearMisses.push({
          menuItemId: itemId,
          orderIds: [neighbour.order.id, c.order.id],
          gapMin: Math.round(Math.abs(c.startAt - neighbour.startAt) / MIN),
          reason: `Not batched: ${c.order.id} has an allergy / cook-separately note — ${pluralName(item)} cooked on their own.`,
        });
      }
    }

    const pool = cands.filter((c) => !c.separate);
    let group: Candidate[] = [];
    const flush = () => {
      if (group.length >= 2) batches.push(makeBatch(item, group));
      group = [];
    };
    for (const c of pool) {
      if (group.length === 0) {
        group = [c];
        continue;
      }
      const first = group[0];
      const fit = canBatch(first, c, item, undefined, undefined, cfg);
      const qty = group.reduce((s, g) => s + g.qty, 0);
      if (fit.ok && qty + c.qty <= cap) {
        group.push(c);
        continue;
      }
      const gap = (c.startAt - first.startAt) / MIN;
      const gapMin = Math.round(gap);
      if (!fit.ok && gap <= cfg.nearMissMaxGapMin) {
        nearMisses.push({
          menuItemId: itemId,
          orderIds: [first.order.id, c.order.id],
          gapMin,
          reason: `Not batched: ${c.order.id} is ${fmtGap(gap)} min after ${first.order.id} — ${sitWhy(item, gap, cfg.batchWindowMin)}.`,
        });
      } else if (fit.ok) {
        nearMisses.push({
          menuItemId: itemId,
          orderIds: [first.order.id, c.order.id],
          gapMin,
          reason: `Not batched: ${c.order.id} — ${item.station} fits only ${itemLabel(item, cap)} at once.`,
        });
      }
      flush();
      group = [c];
    }
    flush();
  }

  batches.sort((a, b) => a.startAt - b.startAt);
  return { batches, nearMisses };
}

function makeBatch(item: MenuItem, group: Candidate[]): Batch {
  const orderIds = group.map((g) => g.order.id);
  const totalQty = group.reduce((s, g) => s + g.qty, 0);
  const startAt = group[0].startAt; // earliest member → nobody is made late
  const maxWait = Math.round((group[group.length - 1].startAt - startAt) / MIN);
  const waitNote = maxWait >= 1 ? ` ${orderIds[orderIds.length - 1]}'s portion waits ≤${maxWait} min (holds ${item.holdMin}).` : "";
  return {
    id: `${item.id}:${orderIds.join(",")}`,
    menuItemId: item.id,
    totalQty,
    orderIds,
    startAt,
    reason: `Cook ${itemLabel(item, totalQty)} together for ${orderIds.join(", ")}.${waitNote}`,
  };
}

const fmtGap = (g: number) => (g < 10 ? g.toFixed(1).replace(/\.0$/, "") : `${Math.round(g)}`);

function sitWhy(item: MenuItem, gapMin: number, windowMin: number): string {
  if (gapMin > item.holdMin) return `${item.holdPhrase ?? "food would sit too long"} (holds ${item.holdMin} min)`;
  return `outside the ${windowMin}-min batch window for ${pluralName(item)}`;
}
