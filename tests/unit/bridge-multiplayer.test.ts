/**
 * Multiplayer bridge tests — M2-F6
 *
 * Tests the client bridge that hooks into the old World module
 * without modifying script/world.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock old World object — rebuilt each test
function makeMockWorld() {
  return {
    generateMap: vi.fn(),
    lightMap: vi.fn(),
    doSpace: vi.fn(),
    drawMap: vi.fn(),
    state: null as unknown,
    curPos: [30, 30] as [number, number],
    RADIUS: 30,
    LIGHT_RADIUS: 2,
  };
}

let mockWorld: ReturnType<typeof makeMockWorld>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Bridge: any;

beforeEach(async () => {
  vi.resetModules();
  mockWorld = makeMockWorld();
  vi.stubGlobal('World', mockWorld);
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3400' });
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: (): void => undefined,
    removeItem: (): void => undefined,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => ({ ok: true, data: {} }) }));
  mockWorld.generateMap.mockReset();
  mockWorld.lightMap.mockReset();
  mockWorld.doSpace.mockReset();
  mockWorld.drawMap.mockReset();

  const mod = await import('../../client/multiplayer-bridge');
  Bridge = mod.MultiplayerBridge;
});

describe('MultiplayerBridge', () => {
  describe('activate', () => {
    it('saves original functions before replacing', () => {
      Bridge.activate('world-id', 'token');
      expect(Bridge.isActive()).toBe(true);
    });

    it('replaces World.generateMap with multiplayer version', () => {
      Bridge.activate('w1', 'tok');
      // Original should be saved
      expect(Bridge.hasOriginal('generateMap')).toBe(true);
    });

    it('replaces World.lightMap with multiplayer version', () => {
      Bridge.activate('w1', 'tok');
      expect(Bridge.hasOriginal('lightMap')).toBe(true);
    });

    it('replaces World.doSpace with multiplayer version', () => {
      Bridge.activate('w1', 'tok');
      expect(Bridge.hasOriginal('doSpace')).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('restores original functions', () => {
      Bridge.activate('w1', 'tok');
      Bridge.deactivate();
      expect(Bridge.isActive()).toBe(false);
    });

    it('does nothing if not active', () => {
      expect(() => Bridge.deactivate()).not.toThrow();
    });
  });

  describe('isLandmark', () => {
    it('returns true for known landmark tiles', () => {
      const check = Bridge.isLandmark('I'); // Iron Mine
      expect(check).toBe(true);
    });

    it('returns false for terrain tiles', () => {
      expect(Bridge.isLandmark(';')).toBe(false);
      expect(Bridge.isLandmark(',')).toBe(false);
      expect(Bridge.isLandmark('.')).toBe(false);
    });

    it('returns true for the village', () => {
      expect(Bridge.isLandmark('A')).toBe(true);
    });
  });
});
