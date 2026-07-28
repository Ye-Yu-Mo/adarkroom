/**
 * Guild production + API tests — M3-F2
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('server/village/production.ts', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Prod: any;

  beforeAll(async () => {
    const mod = await import('../../server/village/production');
    Prod = mod.Production;
  });

  it('calculates 0 for no workers', () => {
    const r = Prod.calculateProduction('gatherer', 0, 3600);
    expect(r).toBe(0);
  });

  it('calculates wood from gatherers over 1 hour', () => {
    // gatherer: 1 wood per 10s = 6 per minute = 360 per hour
    const r = Prod.calculateProduction('gatherer', 3, 3600);
    expect(r).toBeCloseTo(1080, -2); // 3 workers × 360 per hour × 1h
  });

  it('calculates fur+meat from hunters over 1 hour', () => {
    const r = Prod.calculateProduction('hunter', 2, 3600);
    expect(r).toBeCloseTo(720, -2); // 2 hunters × (0.5+0.5)/10s × 3600s
  });

  it('returns 0 for unknown worker type', () => {
    expect(Prod.calculateProduction('nonexistent', 5, 3600)).toBe(0);
  });

  it('getWorkerRate returns rate for known workers', () => {
    expect(typeof Prod.getWorkerRate('gatherer')).toBe('number');
    expect(typeof Prod.getWorkerRate('hunter')).toBe('number');
    expect(typeof Prod.getWorkerRate('trapper')).toBe('number');
    expect(Prod.getWorkerRate('unknown')).toBe(0);
  });
});

describe('guild middleware', () => {
  it('exported registerGuildRoutes is a function', async () => {
    const mod = await import('../../server/village/handler');
    expect(typeof mod.registerGuildRoutes).toBe('function');
  });
});
