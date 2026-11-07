# kitchen_assist — results on the 6 held-out days (3 stores)

Synthetic data. Same orders and random draws for every policy.

| policy | orders | late orders | late % | Dasher wait min | shelf time min | refunds | walkouts | Busy minutes | declined (paused) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| oldest_first | 4349.0 | 1532.0 | 35.2 | 7.3 | 3.3 | 832.0 | 308.0 | 0.0 | 0.0 |
| promised_first | 4349.0 | 1510.0 | 34.7 | 7.0 | 3.3 | 817.0 | 289.0 | 0.0 | 0.0 |
| kitchen_assist | 4096.0 | 869.0 | 21.2 | 1.2 | 4.1 | 308.0 | 174.0 | 3001.7 | 253.0 |
| kitchen_assist (no Busy) | 4349.0 | 1225.0 | 28.2 | 3.4 | 3.7 | 495.0 | 201.0 | 0.0 | 0.0 |

```
Model A — prep time (LightGBM), test = last 6 days, n = 4,349
  MAE  model:                  1.09 min
  MAE  store prep setting:     4.30 min
  MAE  per-item hist. mean:    4.21 min
  Top features: total_base_prep_sec 22%, open_tickets 17%, slack_sec 13%, station_contention 5%, inprog_fryer 5%
```

```
Model B — lateness risk (LightGBM), test = last 6 days, n = 4,349, base rate 27.4%
  AUC 0.977   Brier 0.050
  Calibration (predicted vs observed late):
    bin        n      predicted   observed
    0%–10%     2682       1.4%       1.6%
    10%–20%     226      14.3%      14.2%
    20%–30%     105      24.2%      19.0%
    30%–40%      87      35.4%      32.2%
    40%–50%      99      45.1%      45.5%
    50%–60%      66      54.8%      51.5%
    60%–70%      89      65.4%      55.1%
    70%–80%      88      75.1%      83.0%
    80%–90%     137      85.1%      84.7%
    90%–100%    770      98.5%      97.3%
```
