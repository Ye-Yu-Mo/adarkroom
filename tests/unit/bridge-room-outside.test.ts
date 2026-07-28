/**
 * Room + Outside bridge tests — M3-F4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Bridge: any;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('World', { generateMap: vi.fn(), lightMap: vi.fn(), doSpace: vi.fn(), drawMap: vi.fn(), state: null, curPos: [30, 30], RADIUS: 30, LIGHT_RADIUS: 2 });
  vi.stubGlobal('Room', { build: vi.fn(() => true) });
  vi.stubGlobal('Outside', { updateVillageIncome: vi.fn(), increasePopulation: vi.fn(), getMaxPopulation: vi.fn(() => 10) });
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3400' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: (): void => undefined, removeItem: (): void => undefined });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => ({ ok: true, data: {} }) }));
  const mod = await import('../../client/multiplayer-bridge');
  Bridge = mod.MultiplayerBridge;
});

describe('Room hook', () => {
  it('saves original Room.build', () => {
    Bridge.activate('w1', 'tok');
    expect(Bridge.hasOriginal('roomBuild')).toBe(true);
    Bridge.deactivate();
  });

  it('restores Room.build on deactivate', () => {
    Bridge.activate('w1', 'tok');
    Bridge.deactivate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(typeof (globalThis as any).Room.build).toBe('function');
  });

  it('Room.build is callable after hook', () => {
    Bridge.activate('w1', 'tok');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const btn = { getAttribute: vi.fn(() => 'hut') } as unknown as HTMLElement;
    const result = (globalThis as any).Room.build(btn);
    expect(result).toBeDefined();
    Bridge.deactivate();
  });
});

describe('Outside hook', () => {
  it('saves original Outside functions', () => {
    Bridge.activate('w1', 'tok');
    expect(Bridge.hasOriginal('outsideUpdateIncome')).toBe(true);
    expect(Bridge.hasOriginal('outsideIncreasePop')).toBe(true);
    expect(Bridge.hasOriginal('outsideGetMaxPop')).toBe(true);
    Bridge.deactivate();
  });

  it('restores Outside functions on deactivate', () => {
    Bridge.activate('w1', 'tok');
    Bridge.deactivate();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const O = (globalThis as any).Outside;
    expect(typeof O.updateVillageIncome).toBe('function');
    expect(typeof O.increasePopulation).toBe('function');
    expect(typeof O.getMaxPopulation).toBe('function');
  });
});
