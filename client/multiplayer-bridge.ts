/* eslint-disable @typescript-eslint/no-unsafe-argument */
/**
 * Multiplayer bridge — hooks into the old World module without modifying script/world.js.
 *
 * When activated, replaces World.generateMap, World.lightMap, and World.doSpace
 * with multiplayer-aware versions that source data from the server.
 * Call deactivate() to restore original single-player behavior.
 *
 *   import { MultiplayerBridge } from './multiplayer-bridge';
 *   MultiplayerBridge.activate(worldId, token);
 *   // ... game runs with multiplayer map ...
 *   MultiplayerBridge.deactivate(); // back to single-player
 */

import { WorldSync } from './world-sync';

// ── Landmark tile types ──────────────────────────────────

const LANDMARK_TILES = new Set([
  'I', 'C', 'S', 'H', 'V', 'O', 'Y', 'P', 'W', 'B', 'F', 'M', 'U', 'X', 'A',
]);

// ── Stored originals ─────────────────────────────────────

type WorldLike = Record<string, unknown>;

let active = false;
const originals: Record<string, WorldLike[keyof WorldLike]> = {};
let bridgeWorldId = '';
let bridgeToken = '';

function apiBase(): string {
  if (typeof location !== 'undefined') {
    return `${location.protocol}//${location.hostname}:${location.port || '3000'}`;
  }
  return 'http://localhost:3400';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getWorld(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (globalThis as any).World;
}

export const MultiplayerBridge = {
  isActive(): boolean { return active; },
  hasOriginal(name: string): boolean { return name in originals; },
  isLandmark(tile: string): boolean { return LANDMARK_TILES.has(tile); },

  activate(worldId: string, token: string): void {
    if (active) return;
    const W = getWorld();
    if (!W) return;

    bridgeWorldId = worldId;
    bridgeToken = token;
    active = true;

    // Save originals
    originals.generateMap = W.generateMap;
    originals.lightMap = W.lightMap;
    originals.doSpace = W.doSpace;

    // Initialize WorldSync
    WorldSync.init(worldId, token);

    // Replace generateMap — fetch from server instead of generating locally
    W.generateMap = function () {
      // Multiplayer: map comes from server via WorldSync
      // We still need to initialize curPos and draw the map
      W.state ??= {};
      WorldSync.updateViewport(W.curPos[0], W.curPos[1], W.LIGHT_RADIUS ?? 2).then(() => {
        // Populate W.state.map from cache for drawMap compatibility
        W.state.map = buildStateMap(W.RADIUS ?? 30);
        W.state.mask = buildStateMask(W.RADIUS ?? 30);
      }).catch(() => undefined);
    };

    // Replace lightMap — use server-side explored state
    W.lightMap = function (x: number, y: number, mask: unknown) {
      // Multiplayer: uncovered tiles are stored server-side
      // The client mask is built from WorldSync cache
      WorldSync.updateViewport(x, y, W.LIGHT_RADIUS ?? 2).catch(() => undefined);
      if (Array.isArray(mask)) {
        for (const tile of getAllCachedTiles()) {
          const row = mask[tile.x];
          if (row) row[tile.y] = true;
        }
      }
      return mask;
    };

    // Replace doSpace — check landmark exploration status server-side
    W.doSpace = async function () {
      const curTile = W.state?.map?.[W.curPos[0]]?.[W.curPos[1]];
      if (!curTile) return;

      if (MultiplayerBridge.isLandmark(String(curTile)) && curTile !== 'A') {
        // Check if landmark is already explored
        try {
          const res = await fetch(`${apiBase()}/api/v1/world/${bridgeWorldId}/landmarks`, {
            headers: { Authorization: `Bearer ${bridgeToken}` },
          });
          const body = (await res.json()) as {
            ok: boolean;
            data: { landmarks: { x: number; y: number; explored: boolean }[] };
          };
          if (body.ok) {
            const lm = body.data.landmarks.find(
              (l) => l.x === W.curPos[0] && l.y === W.curPos[1],
            );
            if (lm?.explored) {
              // Already explored — skip or show simplified scene
              // eslint-disable-next-line no-console
              console.log('[bridge] landmark already explored by another player');
              return;
            }
          }
        } catch {
          // Network error — proceed with normal event
        }
      }
      // Call original doSpace for single-player behavior
      if (originals.doSpace) {
        (originals.doSpace as () => void).call(W);
      }
    };
  },

  deactivate(): void {
    if (!active) return;
    const W = getWorld();
    if (W) {
      for (const [name, fn] of Object.entries(originals)) {
        W[name] = fn;
      }
    }
    active = false;
  },
};

// ── Helpers ──────────────────────────────────────────────

function buildStateMap(radius: number): string[][] {
  const size = radius * 2 + 1;
  const map: string[][] = [];
  for (let y = 0; y < size; y++) {
    map[y] = [];
    for (let x = 0; x < size; x++) {
      const tile = WorldSync.getTile(x, y);
      const row = map[y];
      if (row) row[x] = tile?.tile_type ?? ' ';
    }
  }
  return map;
}

function buildStateMask(radius: number): boolean[][] {
  const size = radius * 2 + 1;
  const mask: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    mask[y] = [];
    for (let x = 0; x < size; x++) {
      const row = mask[y];
      if (row) row[x] = WorldSync.getTile(x, y) !== null;
    }
  }
  return mask;
}

function getAllCachedTiles(): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let x = 0; x <= 60; x++) {
    for (let y = 0; y <= 60; y++) {
      if (WorldSync.getTile(x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}
