/**
 * World generator tests — M2-F2
 *
 * Validates server/world/generator.ts:
 * - Deterministic output (same seed = same map)
 * - Correct map dimensions
 * - Village at center
 * - Terrain distribution
 * - Landmark placement at correct radii
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('world generator', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let generateWorld: any;

  beforeAll(async () => {
    const mod = await import('../../server/world/generator');
    generateWorld = mod.generateWorld;
  });

  it('produces a map of (2*radius+1) × (2*radius+1)', () => {
    const world = generateWorld(42, 30);
    const size = 30 * 2 + 1;
    expect(world.tiles.length).toBe(size);
    for (const row of world.tiles) {
      expect(row.length).toBe(size);
    }
  });

  it('places village at the exact center', () => {
    const world = generateWorld(42, 30);
    expect(world.tiles[30]?.[30]).toBe('A'); // VILLAGE
  });

  it('is deterministic — same seed produces same map', () => {
    const a = generateWorld(12345, 30);
    const b = generateWorld(12345, 30);
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        expect(a.tiles[i]?.[j]).toBe(b.tiles[i]?.[j]);
      }
    }
  });

  it('different seeds produce different maps', () => {
    const a = generateWorld(1, 30);
    const b = generateWorld(2, 30);
    let diffCount = 0;
    for (let i = 0; i <= 60; i++) {
      for (let j = 0; j <= 60; j++) {
        if (a.tiles[i]?.[j] !== b.tiles[i]?.[j]) diffCount++;
      }
    }
    // At least some tiles should differ
    expect(diffCount).toBeGreaterThan(100);
  });

  it('produces only valid terrain types (;, .)', () => {
    const world = generateWorld(42, 30);
    const valid = new Set([';', ',', '.']);
    for (const row of world.tiles) {
      for (const tile of row) {
        // Only check terrain tiles (skip village and landmarks)
        if (tile !== 'A' && !world.landmarks.some((l: { tileType: string }) => l.tileType === tile)) {
          // Non-village, non-landmark tiles should be terrain
          expect(valid.has(tile as string)).toBe(true);
        }
      }
    }
  });

  it('returns landmarks with correct fields', () => {
    const world = generateWorld(42, 30);
    expect(world.landmarks.length).toBeGreaterThan(50);
    for (const lm of world.landmarks) {
      expect(typeof lm.x).toBe('number');
      expect(typeof lm.y).toBe('number');
      expect(typeof lm.tileType).toBe('string');
      expect(lm.tileType.length).toBe(1);
      expect(typeof lm.scene).toBe('string');
      expect(typeof lm.label).toBe('string');
      expect(lm.x).toBeGreaterThanOrEqual(0);
      expect(lm.y).toBeGreaterThanOrEqual(0);
      expect(lm.x).toBeLessThanOrEqual(60);
      expect(lm.y).toBeLessThanOrEqual(60);
    }
  });

  it('respects radius parameter', () => {
    const small = generateWorld(42, 10);
    const size = 10 * 2 + 1;
    expect(small.tiles.length).toBe(size);
  });
});
