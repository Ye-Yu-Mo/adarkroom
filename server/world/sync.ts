/**
 * Map sync utilities — hash computation and tile diff for incremental updates.
 *
 *   import { computeTileHash, diffTiles } from './sync';
 *   const hash = computeTileHash(tiles);
 *   const { changed, hash: newHash } = diffTiles(clientHash, viewportTiles);
 */

import { createHash } from 'node:crypto';

export interface TileRow {
  x: number;
  y: number;
  tile_type: string;
  explored?: boolean;
}

export interface DiffResult {
  changed: TileRow[];
  hash: string;
}

/**
 * Compute a deterministic SHA-256 hash of a tile set.
 * Tiles are sorted by x,y before hashing so order doesn't matter.
 */
export function computeTileHash(tiles: TileRow[]): string {
  const sorted = [...tiles].sort((a, b) => a.x - b.x || a.y - b.y);
  const input = sorted.map((t) => `${t.x},${t.y}:${t.tile_type}:${t.explored ? '1' : '0'}`).join('|');
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Compare a client-provided hash with the current tile set.
 * Returns only changed tiles (or all tiles if the hash is null or mismatched).
 */
export function diffTiles(clientHash: string | null, currentTiles: TileRow[]): DiffResult {
  const currentHash = computeTileHash(currentTiles);

  if (clientHash === null || clientHash !== currentHash) {
    return { changed: currentTiles, hash: currentHash };
  }

  return { changed: [], hash: currentHash };
}
