/**
 * Map sync tests — M2-F3
 *
 * Tests server-side hash computation + client-side cache.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Stub browser APIs for client module
vi.stubGlobal('localStorage', {
  _data: {} as Record<string, string>,
  getItem(k: string) { return this._data[k] ?? null; },
  setItem(k: string, v: string) { this._data[k] = v; },
  removeItem(k: string) { delete this._data[k]; },
});

describe('server/world/sync.ts — hash & diff', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let computeTileHash: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let diffTiles: any;

  beforeAll(async () => {
    const mod = await import('../../server/world/sync');
    computeTileHash = mod.computeTileHash;
    diffTiles = mod.diffTiles;
  });

  it('produces a non-empty hex string', () => {
    const tiles = [{ x: 0, y: 0, tile_type: 'A', explored: false }];
    const hash = computeTileHash(tiles) as string;
    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('same tiles produce same hash', () => {
    const a = [{ x: 1, y: 2, tile_type: ';', explored: false }];
    const b = [{ x: 1, y: 2, tile_type: ';', explored: false }];
    expect(computeTileHash(a)).toBe(computeTileHash(b));
  });

  it('different tiles produce different hash', () => {
    const a = [{ x: 1, y: 2, tile_type: ';' }];
    const b = [{ x: 1, y: 2, tile_type: ',' }];
    expect(computeTileHash(a)).not.toBe(computeTileHash(b));
  });

  it('order-independent (sorted before hashing)', () => {
    const a = [
      { x: 0, y: 0, tile_type: ';' },
      { x: 1, y: 1, tile_type: ',' },
    ];
    const b = [
      { x: 1, y: 1, tile_type: ',' },
      { x: 0, y: 0, tile_type: ';' },
    ];
    expect(computeTileHash(a)).toBe(computeTileHash(b));
  });

  it('explored status affects hash', () => {
    const a = [{ x: 0, y: 0, tile_type: ';', explored: false }];
    const b = [{ x: 0, y: 0, tile_type: ';', explored: true }];
    expect(computeTileHash(a)).not.toBe(computeTileHash(b));
  });

  it('diffTiles returns empty when hashes match', () => {
    const tiles = [{ x: 0, y: 0, tile_type: 'A' }];
    const hash = computeTileHash(tiles);
    const result = diffTiles(hash, tiles);
    expect(result.changed).toHaveLength(0);
    expect(result.hash).toBe(hash);
  });

  it('diffTiles returns all tiles when no hash provided', () => {
    const tiles = [
      { x: 0, y: 0, tile_type: 'A' },
      { x: 1, y: 1, tile_type: ';' },
    ];
    const result = diffTiles(null, tiles);
    expect(result.changed).toHaveLength(2);
    expect(result.hash).toBeTruthy();
  });

  it('diffTiles returns only changed on mismatch', () => {
    const old = [
      { x: 0, y: 0, tile_type: 'A' },
      { x: 1, y: 1, tile_type: ';' },
    ];
    const oldHash = computeTileHash(old);

    const current = [
      { x: 0, y: 0, tile_type: 'A' },
      { x: 1, y: 1, tile_type: ',' }, // changed from ';' to ','
    ];
    const result = diffTiles(oldHash, current);
    expect(result.changed).toHaveLength(2); // all tiles returned on hash mismatch
    expect(result.hash).toBe(computeTileHash(current));
  });
});

describe('client/world-sync.ts — cache', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let WorldSync: any;

  beforeAll(async () => {
    const mod = await import('../../client/world-sync');
    WorldSync = mod.WorldSync;
  });

  beforeEach(() => {
    WorldSync.reset();
  });

  it('starts with empty cache', () => {
    expect(WorldSync.getTile(0, 0)).toBeNull();
  });

  it('merges tiles into cache', () => {
    WorldSync.mergeTiles([
      { x: 0, y: 0, tile_type: 'A', explored: false },
      { x: 1, y: 0, tile_type: ';', explored: false },
    ]);
    expect(WorldSync.getTile(0, 0)?.tile_type).toBe('A');
    expect(WorldSync.getTile(1, 0)?.tile_type).toBe(';');
    expect(WorldSync.getTile(2, 0)).toBeNull();
  });

  it('updates existing tiles on merge', () => {
    WorldSync.mergeTiles([{ x: 0, y: 0, tile_type: ';' }]);
    WorldSync.mergeTiles([{ x: 0, y: 0, tile_type: ',', explored: true }]);
    expect(WorldSync.getTile(0, 0)?.tile_type).toBe(',');
    expect(WorldSync.getTile(0, 0)?.explored).toBe(true);
  });

  it('key() formats coordinates', () => {
    expect(WorldSync.key(5, 10)).toBe('5,10');
  });

  it('getViewportHash() returns hex string', () => {
    WorldSync.mergeTiles([{ x: 0, y: 0, tile_type: 'A' }]);
    WorldSync.updateViewport(0, 0, 2);
    const hash = WorldSync.getViewportHash();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });
});
