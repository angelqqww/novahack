# One Line — unified order queue + smart scheduler

Hackathon MVP (DoorDash × Nova). Walk-in and DoorDash orders land in **one queue**. DoorDash orders are
auto-accepted, and a scheduler tells the kitchen **when to start each order** and why, in plain words.
It also **batches** the same item across orders when their start times are close enough.

All data is simulated. There's no real DoorDash/POS integration, database or auth.

## Run it

```bash
cd one-line
npm install
npm run dev          # http://localhost:3000/one-line  (binds 0.0.0.0, so a phone on the same Wi-Fi works too)
npm test             # 36 vitest tests: scheduler, batching, prep model, demo scenario
```

- `/one-line/kitchen`: the kitchen screen (tablet or TV, landscape).
- `/one-line/control`: demo control panel.

The app is served under the base path `/one-line` (set in `next.config.ts`), so it can share a Vercel
domain with Pulse. API routes are at `/one-line/api/*`.
- Optional: copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`. That turns on LLM order-note
  parsing and the AI "Explain the queue" summary. Without it, keyword rules and a template are used, and
  everything still works.

## 3-minute demo script

1. Open `/control` and click **Load demo scenario**. Open `/kitchen` in another window (or on the TV).
   The sim runs at 5×; pause it any time.
2. **One queue:** walk-ins (blue) and DoorDash (red, "Auto-accepted ✓") are sorted together:
   LATE → START NOW → UP NEXT → HOLD. Every card says why, e.g.
   *"Hold 11 min — dasher Omar is 22 min away; fries would go soggy if started now."*
3. **Batching:** #202 and #203 both want Chicken Tacos with starts ~2 min apart, so the side panel shows
   *"🔗 Cook 5 Chicken Tacos together for #202, #203"*. #206 and #207 want Quesadillas 9 min apart, which
   is **not** batched: *"Not batched: #207 is 9 min after #206 — quesadillas would go limp (holds 5 min)."*
   #204's nut allergy keeps it out of any batch.
4. **Sad path — dasher delayed:** on `/control`, click **#206 · Dev** under "Dasher delayed +8 min". Within
   a second #206 slides down the queue to HOLD. It's now 1 min from #207, so the quesadillas **batch**.
5. **Learning:** hit **Start cooking**, then **Mark ready** on any order. The top bar's
   "Model learned from N live orders" goes up and shows what changed (e.g. *Burrito: 9.9 → 9.4 min*).
6. **Sad path — rush:** toggle **Rush mode**. Order rate triples plus a burst of 6 orders. Station bars
   fill, and the reasons switch to capacity (*"Pushed back 6 min — fryer is full."*).
7. Optional: **Explain the queue** on the kitchen screen gives a 2-sentence summary.

For an unattended screen (e.g. a booth), turn on **Random orders** and **Auto-cook** in `/control`.

## Design

The look follows the DoorDash app's visual language (Dasher homescreen redesign + consumer app UI kit), without
DoorDash logos or assets:

- **Colors:** white "sheets" on light gray, red pill buttons (`#EB1700`), black segmented controls, teal tags for
  batches (like "Buy 3, save $10" deals), a green highlight for live/peak data. Tokens are in `app/globals.css`.
- **Font:** [Figtree](https://fonts.google.com/specimen/Figtree), loaded with `next/font`.
- **Icons:** `lucide-react`.
- **Building blocks** (`components/ui.tsx`): `Sheet`, `RedButton`, `DarkButton`, `GrayButton`, `Chip`,
  `Segmented`, `Switch`, `FloatPill`, `Logo`. Teammates should reuse these so new pages match.
- **Station load** is drawn like the peak-pay bar chart, one bar per slot: green = cooking, dark = planned,
  red = full. The home page uses a heat-map hero (`components/MapArt.tsx`), and phones get a bottom tab bar.

## How it works

```
orders ──► prep model ──► ideal start ──► batching ──► station capacity ──► priority + reason ──► sorted queue
           (learned)      DoorDash: ETA − prep        same item, close       pushes later starts,
                          walk-in: when ordered       start times            breaks up batches that don't fit
```

| File | What it does | Pure? |
| --- | --- | --- |
| `lib/types.ts` | Shared data model (**teammates import this**) | — |
| `lib/config.ts` | All tunables: batch window, pack buffer, station capacities, sim speed, thresholds | — |
| `lib/menu.ts` | 9-item taqueria menu (station, base prep, hold time, batchable) | ✓ |
| `lib/prepModel.ts` | 30 days of synthetic history → per-item `prep = (a + b·load) × peak` (least squares + Fri/Sat-evening factor) → online moving-average updates when orders are marked ready | ✓ |
| `lib/scheduler.ts` | Ideal start, station-capacity placement, priority labels, reason templates, sort | ✓ |
| `lib/batching.ts` | Groups the same batchable item when `startAt` gap ≤ `min(batchWindowMin, item.holdMin)`, never with allergy/cook-separately orders, never past station capacity; reports near-misses | ✓ |
| `lib/engine.ts` | Runs the whole pipeline in one call: `computeQueue(...)` | ✓ |
| `lib/notes.ts`, `lib/llm.ts` | Note parsing: keyword rules, optionally upgraded by the LLM (results cached) | rules ✓ |
| `lib/simulator.ts` | Random orders, dasher ETA drift, scripted demo scenario | ✓ (seeded) |
| `lib/store.ts` | The only stateful module: in-memory singleton, sim clock, mutations | ✗ |

Key rules:

- **DoorDash:** `startAt = dasherEtaAt − predictedPrepMin`. `predictedPrepMin` = slowest item (stations cook
  in parallel) + 2 min pack buffer.
- **Walk-in:** should start the moment they ordered. It goes LATE after 1 min of waiting and is never put on HOLD.
- **Labels:** LATE = ideal start passed by > 1 min · START NOW = within 1 min · UP NEXT = within 5 min · HOLD = later.
- **Batches** start at the earliest member's time, so no one is made later. If capacity would push a batch
  back, it's broken up and cooked separately.
- The clock moves forward on each `/api/state` call (real time × speed). There's no background timer, and the
  store lives on `globalThis`, so every route shares it.

## API

| Method | Route | Body / notes |
| --- | --- | --- |
| GET | `/api/state` | `{ simNow, orders, batches, nearMisses, stations, modelStats, sim, menu }` (`AppState`) |
| POST | `/api/orders` | `{ channel?, items?, notes?, customerName?, dasherName?, dasherEtaMin? }`; anything left out is randomized |
| GET | `/api/orders/:id` | One order. `:id` can be `212`, `%23212` or `#212` (URL-encoded) |
| POST | `/api/orders/:id/status` | `{ status: "cooking" \| "ready" \| "picked_up" \| "queued" }` |
| POST | `/api/orders/:id/delay` | `{ minutes?: 8 }`: dasher delayed |
| POST | `/api/batches/start` | `{ batchId }` |
| POST | `/api/sim` | `{ action: "start" \| "pause" \| "reset" \| "scenario" }`, `{ action: "speed", speed }`, `{ action: "rush" \| "random" \| "autocook", on }` |
| POST | `/api/parse-notes` | `{ notes }` → `{ extraPrepMin, cookSeparately, flags, source }` |
| POST | `/api/explain` | 2-sentence summary of the current queue |

## Adding a page (for teammates)

Pages live in `app/<name>/page.tsx`. Use the shared types and the polling hook:

```tsx
"use client";
import { useOneLine, orderPath } from "@/components/useOneLine";
import type { Order } from "@/lib/types";

export default function DasherCheckIn() {
  const { state, now, post } = useOneLine();          // polls /api/state every 1 s
  const order: Order | undefined = state?.orders.find((o) => o.id === "#202");
  if (!order) return null;
  const readyInMin = Math.max(0, Math.round(((order.readyAt ?? now) - now) / 60_000));
  return <h1>Shelf {order.shelf ?? "—"}, ready in {readyInMin} min</h1>;
  // e.g. post(`${orderPath(order.id)}/status`, { status: "picked_up" }) after the bag check
}
```

Useful fields for the planned pages:

- **Dasher check-in:** `order.shelf` (assigned when cooking starts, e.g. `"B3"`), `order.readyAt` (predicted),
  `order.status`, `order.dasherName`, `order.dasherEtaAt`. A QR code can just encode `/checkin?order=212`.
- **Bag check:** `order.items` (with `state.menu` for names), `order.flags` (e.g. `ALLERGY`), `order.notes`.
  Mark `picked_up` once the bag passes.

Keep new logic as pure functions in `lib/` (like `scheduler.ts`) and put state changes in `lib/store.ts`
behind an API route, so every device sees the same thing.

## Limits (fine for a demo)

- State is in memory: restarting `npm run dev` resets it. A serverless deploy wouldn't share state between instances.
- Prep times come from synthetic history. Clicking "Mark ready" seconds after "Start" teaches the model the
  kitchen is fast; each update is capped at ±3 min × 0.15.
