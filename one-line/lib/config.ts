import type { Station } from "./types";

// All tunable numbers live here.
export const CONFIG = {
  /** Max minutes between two orders' start times for the same item to share a batch. */
  batchWindowMin: 3,
  /** Minutes to bag and label an order after the food is done (part of predictedPrepMin). */
  packBufferMin: 2,
  /** Max concurrent items per station. */
  stationCapacity: { grill: 10, fryer: 4, cold: 6, assembly: 3 } as Record<Station, number>,
  /** An order is "late" once its start time passed by more than this. */
  lateThresholdMin: 1,
  /** "start_now" if the start time is within this many minutes. */
  startNowWindowMin: 1,
  /** "upcoming" if the start time is within this many minutes, otherwise "hold". */
  upcomingWindowMin: 5,
  /** Only show "not batched" near-misses up to this gap (keeps the panel readable). */
  nearMissMaxGapMin: 15,

  // Simulator
  simSpeedDefault: 5,
  simSpeeds: [1, 2, 5, 10],
  /** Average sim-seconds between random orders (rush divides this). */
  orderIntervalSec: 110,
  rushMultiplier: 3,
  rushBurstOrders: 6,
  doordashShare: 0.6,
  dasherEtaMinRange: [5, 20] as [number, number],
  /** Longest wall-clock gap processed in one step, so a sleeping tab doesn't flood the queue. */
  maxStepWallMs: 5000,
  walkinPickupAfterMin: 1,

  // Learning
  learnAlpha: 0.15,
  learnMaxResidualMin: 3,
  historyDays: 30,
  historySeed: 42,
};

export type Config = typeof CONFIG;

/** Sim clock starts on a Friday evening rush: Fri 6 Nov 2026, 18:00 (shown as UTC). */
export const SIM_EPOCH = Date.UTC(2026, 10, 6, 18, 0, 0);

export const MIN = 60_000;
