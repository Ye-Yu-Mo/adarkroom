/**
 * Resource production calculator for guild villages.
 *
 * Mirrors the production rates from script/outside.js Outside._INCOME.
 * Used by the server to calculate offline resource accumulation.
 */

// Production rates per worker per 10-second tick
const WORKER_RATES: Record<string, Record<string, number>> = {
  gatherer: { wood: 1 },
  hunter: { fur: 0.5, meat: 0.5 },
  trapper: { meat: -1, bait: 1 },
  tanner: { fur: -5, leather: 1 },
  charcutier: { meat: -5, wood: -5, 'cured meat': 1 },
  'iron miner': { 'cured meat': -1, iron: 1 },
  'coal miner': { 'cured meat': -1, coal: 1 },
  'sulphur miner': { 'cured meat': -1, sulphur: 1 },
  steelworker: { iron: -1, coal: -1, steel: 1 },
  armourer: { steel: -1, sulphur: -1, bullets: 1 },
};

const TICK_SECONDS = 10;

export const Production = {
  /** Get the total per-second production rate for a worker type. */
  getWorkerRate(workerType: string): number {
    const rates = WORKER_RATES[workerType];
    if (!rates) return 0;
    // Sum all resource outputs (positive values)
    return Object.values(rates).reduce((sum, v) => sum + Math.max(0, v), 0) / TICK_SECONDS;
  },

  /**
   * Calculate total resource produced by a given number of workers over a time period.
   * @param workerType - type of worker (gatherer, hunter, etc.)
   * @param count - number of workers assigned
   * @param elapsedSeconds - time elapsed since last production tick
   * @returns total production amount (sum of all positive resource outputs)
   */
  calculateProduction(workerType: string, count: number, elapsedSeconds: number): number {
    const rates = WORKER_RATES[workerType];
    if (!rates) return 0;

    const ticks = elapsedSeconds / TICK_SECONDS;
    // Sum positive outputs
    const outputPerTick = Object.values(rates).reduce((sum, v) => sum + Math.max(0, v), 0);

    return outputPerTick * count * ticks;
  },

  /**
   * Get all resource deltas for a worker type.
   * Returns a map of resource_name → change_per_worker_per_tick.
   */
  getResourceDeltas(workerType: string): Record<string, number> {
    return WORKER_RATES[workerType] ?? {};
  },
};
