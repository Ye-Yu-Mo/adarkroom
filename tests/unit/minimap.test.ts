/**
 * Minimap tests — M2-F4
 *
 * Tests client/minimap.ts rendering logic:
 * - tile-to-color mapping
 * - coordinate transforms
 * - player position tracking
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Minimap: any;

beforeEach(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => null, style: {} }),
    querySelector: () => null,
  };
  vi.resetModules();
  const mod = await import('../../client/minimap');
  Minimap = mod.Minimap;
});

describe('Minimap', () => {
  describe('tile colors', () => {
    it('returns color for village', () => {
      expect(Minimap.tileColor('A')).toBe('#ffdd44');
    });
    it('returns color for forest', () => {
      expect(Minimap.tileColor(';')).toBe('#2d5a1e');
    });
    it('returns color for field', () => {
      expect(Minimap.tileColor(',')).toBe('#8b7355');
    });
    it('returns color for barrens', () => {
      expect(Minimap.tileColor('.')).toBe('#4a4a4a');
    });
    it('returns gray for unknown tiles', () => {
      expect(Minimap.tileColor('Z')).toBe('#111111');
    });
  });

  describe('coordinate transform', () => {
    it('converts world coords to canvas pixel coords', () => {
      Minimap.init(30, 30, 5, 4); // center x,y tileSize=4
      const { px, py } = Minimap.worldToPixel(30, 30);
      // Center should be at canvas center offset
      expect(px).toBeGreaterThan(0);
      expect(py).toBeGreaterThan(0);
    });

    it('north of center has lower y in pixels', () => {
      Minimap.init(30, 30, 5, 4);
      const center = Minimap.worldToPixel(30, 30);
      const north = Minimap.worldToPixel(30, 28);
      expect(north.py as number).toBeLessThan(center.py as number);
    });
  });

  describe('player tracking', () => {
    it('sets own position', () => {
      Minimap.setOwnPosition(30, 30);
      expect(Minimap.getOwnPosition()).toEqual({ x: 30, y: 30 });
    });

    it('adds and removes other player positions', () => {
      Minimap.updatePlayer('p2', 'Alice', 32, 31);
      Minimap.updatePlayer('p3', 'Bob', 28, 29);

      expect(Minimap.getPlayerCount()).toBe(2);

      Minimap.removePlayer('p2');
      expect(Minimap.getPlayerCount()).toBe(1);
      expect(Minimap.getPlayers()[0]?.name).toBe('Bob');
    });
  });

  describe('viewport calculation', () => {
    it('clamps viewport to map bounds', () => {
      const vp = Minimap.viewportBounds(30, 30, 5, 61, 61);
      expect(vp.x1).toBe(25);
      expect(vp.y1).toBe(25);
      expect(vp.x2).toBe(35);
      expect(vp.y2).toBe(35);
    });

    it('clamps viewport at map edges', () => {
      const vp = Minimap.viewportBounds(2, 2, 10, 61, 61);
      expect(vp.x1).toBe(0);
      expect(vp.y1).toBe(0);
    });
  });
});
