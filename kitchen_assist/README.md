# kitchen_assist

Ranks open kitchen tickets by **who gets hurt most by waiting**, batches same-item work, and decides when
to set the delivery tablet to **Busy**. Evaluated against two baselines (oldest-first, promised-time-first)
on synthetic data, since no real data is available.

## The problem

During a rush, a kitchen screen usually shows tickets oldest-first. But a guest standing at the counter, a
Dasher already at the door, and a scheduled pickup 20 minutes away are not equally hurt by a 5-minute delay.
kitchen_assist predicts each ticket's prep time and lateness risk, scores tickets by who is waiting, cooks
identical items together when it doesn't delay anyone, and throttles delivery/kiosk intake before the kitchen
falls behind (never the counter).

## How it works

- **Model A — prep time** (`models/prep_time.py`): LightGBM regressor (sklearn HistGradientBoosting fallback)
  predicting seconds from confirm to ready, from confirm-time features: open tickets, items in progress per
  station, staff, equipment, hour/weekday, ticket contents, channel and slack.
- **Model B — lateness risk** (`models/lateness.py`): LightGBM classifier for `ready > promised`, using Model A's
  prediction (out-of-fold on training days), slack, open tickets, station contention and the same features.
  `predict_risk(features) -> probability`.
- **Label cleaning** (`features.py`): if a ticket was picked up before its ready tap, the tap was late, so use
  the pickup time. If 3+ tickets at one store were tapped ready within 3 s, keep the earliest and give the
  others `sample_weight = 0.3`.
- **Scorer** (`scheduler.py`): `score = tier_weight + 3.0 × risk + 0.05 × minutes_waited`.
  - Tiers: counter 3.0, Dasher at the door 3.0, Dasher en route 2.0, mobile scheduled 1.0.
  - Presence: counter and kiosk count as present from placement. DoorDash is en route until the Dasher's ETA
    reaches 0, then at the door. Mobile is scheduled until the pickup time or `phone_nearby`.
  - Hard constraint: a ticket that would start after its promise is moved up, as little as possible, when
    another order avoids the miss.
  - Freeze: the previous plan's top 5, and anything within 120 s of starting, keep their positions.
  - Batching: scanning top-down, the same item is pulled from lower tickets when the lower ticket's
    predicted ready time is 0 to `hold_tolerance` after the leader's, within the station's `max_batch`.
    Batching never reorders tickets and never makes anyone wait for a partner.
  - Busy: if more than 40% of open tickets have risk above 0.6, or the backlog exceeds staff capacity,
    DoorDash and kiosk quote +10 min for 15 min. If it's still true after 5 min, delivery is paused. It
    de-escalates when under 10% are at risk. The counter is never throttled.
  - `estimate_tier_weights(df)` re-derives the tier weights from refund/walkout rate per minute of waiting.
- **Simulator** (`simulate.py`): discrete-event replay of a store-day.
  - Cooks (staff + 2 helpers) and per-station capacity limit what can cook at once.
  - Cook times come from the generator's true prep function.
  - Every order keeps its own random draws, so all policies face the same day.

## Run

From the repository root (the folder that contains `kitchen_assist/`):

```bash
python3.11 -m venv kitchen_assist/.venv
```
```bash
kitchen_assist/.venv/bin/pip install -r kitchen_assist/requirements.txt
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.data.generate
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.models.prep_time
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.models.lateness
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.evaluate
```
```bash
kitchen_assist/.venv/bin/python -m kitchen_assist.demo
```
```bash
kitchen_assist/.venv/bin/python -m pytest kitchen_assist/tests -q
```

`evaluate` alone also generates the data and trains both models if needed (about 1 minute). Results go to
`results/summary.md`.

## Results (synthetic, 6 held-out days × 3 stores, 4,349 orders)

| policy | late % | Dasher wait (min) | shelf (min) | refunds | walkouts | Busy min | declined |
|---|---:|---:|---:|---:|---:|---:|---:|
| oldest_first | 35.2 | 7.3 | 3.4 | 832 | 308 | 0 | 0 |
| promised_first | 34.7 | 7.0 | 3.3 | 817 | 289 | 0 | 0 |
| kitchen_assist (no Busy) | 28.2 | 3.4 | 3.7 | 495 | 201 | 0 | 0 |
| kitchen_assist | 21.2 | 1.2 | 4.1 | 308 | 174 | 3,002 | 253 |

- Model A MAE is **1.09 min**, vs 4.30 for the store's prep setting and 4.21 for per-item averages.
- Model B has AUC **0.977**, Brier 0.050, and is well calibrated.

**Caveats:**
- The data is synthetic and very regular, so real models will score lower.
- Ranking alone (no Busy) cuts late orders from 35% to 28% and Dasher wait from 7.3 to 3.4 min.
- The rest of the gain comes from Busy. Busy runs about 2.8 h per store-day and declines 5.8% of orders,
  so its thresholds need tuning against lost revenue before a real pilot.

## Demo

`python -m kitchen_assist.demo` replays a 12:15–12:25 lunch rush at one store with 24 tickets (9 counter,
8 kiosk, 3 mobile, 4 DoorDash). Kiosk guests show their kiosk number (e.g. "Mia · K2"). It prints the ranked queue every 30 simulated seconds with:

- tier
- elapsed time since the guest ordered
- time left to the promise
- risk and score
- batch membership
- frozen marker
- the tablet action and message

## Swapping in real DoorDash timestamps

Load your export into a DataFrame with one row per order and map these columns:

| your data | kitchen_assist column |
|---|---|
| order created | `placed_at` → `placed_s` (seconds since midnight) |
| quoted ready / pickup time | `promised_at` → `promised_s` |
| merchant confirmed | `confirmed_at` → `confirmed_s` |
| "order ready" tap | `ready_at` → `ready_s` |
| Dasher / customer pickup | `picked_up_at` → `picked_up_s` |

Also provide:

- `store_id`, `date`, `day_index`, `channel` (counter/kiosk/mobile/doordash)
- `items` (a list of menu item names, with each item's station, prep, hold and batch limits added to `MENU`
  in `data/generate.py`), `modifiers` (list)
- `staff_on_shift`, `equipment_down`, `hour`, `weekday`, `store_prep_setting_sec`
- For DoorDash, `dasher_arrival_s` (Dasher arrival time); for mobile, `scheduled_pickup_s`

Then call `features.prepare(df)` and train with `prep_time.train_and_save(df)` and
`lateness.train_and_save(df)`. The simulator also needs the per-order random draws (`cook_noise`, `refund_u`,
...) that only synthetic data has. On real data, evaluate the models directly, and use the scheduler live
via `Scheduler.plan()`.
