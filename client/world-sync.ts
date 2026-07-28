/**
 * Client-side world map cache with incremental sync.
 *
 * Maintains a local tile cache and viewport hash for efficient
 * incremental map updates from the server.
 *
 *   import { WorldSync } from './world-sync';
 *   WorldSync.init(worldId, token);
 *   WorldSync.updateViewport(playerX, playerY, radius);
 *   const tile = WorldSync.getTile(x, y);
 */

interface CachedTile {
  tile_type: string;
  explored: boolean;
}

const STORAGE_PREFIX = 'adr_world_cache_';

let cache = new Map<string, CachedTile>();
let worldId = '';
let authToken = '';
let viewportHash: string | null = null;
let viewportCenter = { x: 0, y: 0 };
let viewportRadius = 0;

function apiBase(): string {
  if (typeof location !== 'undefined') {
    return `${location.protocol}//${location.hostname}:${location.port || '3000'}`;
  }
  return 'http://localhost:3400'; // fallback for test environment
}

export const WorldSync = {
  key(x: number, y: number): string {
    return `${x},${y}`;
  },

  init(wid: string, token: string): void {
    worldId = wid;
    authToken = token;
    cache = new Map();
    viewportHash = null;
    // Try loading cached tiles from localStorage
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${wid}`);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, CachedTile>;
        cache = new Map(Object.entries(saved));
      }
    } catch {
      // Corrupted cache — start fresh
    }
  },

  getTile(x: number, y: number): CachedTile | null {
    return cache.get(this.key(x, y)) ?? null;
  },

  mergeTiles(tiles: { x: number; y: number; tile_type: string; explored?: boolean }[]): void {
    for (const t of tiles) {
      const existing = cache.get(this.key(t.x, t.y));
      cache.set(this.key(t.x, t.y), {
        tile_type: t.tile_type,
        explored: t.explored ?? existing?.explored ?? false,
      });
    }
    this.saveCache();
  },

  /** Call when player moves. Fetches new tiles from server if viewport changed. */
  async updateViewport(cx: number, cy: number, radius: number): Promise<void> {
    // Only re-fetch if viewport actually moved
    if (cx === viewportCenter.x && cy === viewportCenter.y && radius === viewportRadius) {
      return;
    }
    viewportCenter = { x: cx, y: cy };
    viewportRadius = radius;

    const x1 = Math.max(0, cx - radius);
    const y1 = Math.max(0, cy - radius);
    const x2 = Math.min(60, cx + radius);
    const y2 = Math.min(60, cy + radius);

    const url = new URL(`${apiBase()}/api/v1/world/${worldId}/tiles`);
    url.searchParams.set('x1', String(x1));
    url.searchParams.set('y1', String(y1));
    url.searchParams.set('x2', String(x2));
    url.searchParams.set('y2', String(y2));
    if (viewportHash) {
      url.searchParams.set('hash', viewportHash);
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const body = (await res.json()) as {
      ok: boolean;
      data: { tiles: { x: number; y: number; tile_type: string; explored: boolean }[]; hash: string };
    };

    if (body.ok && body.data.tiles.length > 0) {
      this.mergeTiles(body.data.tiles);
    }
    viewportHash = body.data.hash;
  },

  getViewportHash(): string {
    const tiles: { x: number; y: number; tile_type: string; explored: boolean }[] = [];
    for (let dy = -viewportRadius; dy <= viewportRadius; dy++) {
      for (let dx = -viewportRadius; dx <= viewportRadius; dx++) {
        const t = this.getTile(viewportCenter.x + dx, viewportCenter.y + dy);
        if (t) {
          tiles.push({ x: viewportCenter.x + dx, y: viewportCenter.y + dy, ...t });
        }
      }
    }
    // Simple hash: concatenate tile data
    const input = tiles
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((t) => `${t.x},${t.y}:${t.tile_type}:${t.explored ? '1' : '0'}`)
      .join('|');
    // Use a simple hash for client-side (no crypto in browser without HTTPS)
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h + input.charCodeAt(i)) | 0;
    }
    return String(h >>> 0);
  },

  saveCache(): void {
    try {
      const obj: Record<string, CachedTile> = {};
      for (const [k, v] of cache) {
        obj[k] = v;
      }
      localStorage.setItem(`${STORAGE_PREFIX}${worldId}`, JSON.stringify(obj));
    } catch {
      // Storage full — evict oldest or just skip
    }
  },

  reset(): void {
    cache = new Map();
    viewportHash = null;
    viewportCenter = { x: 0, y: 0 };
    viewportRadius = 0;
  },
};
