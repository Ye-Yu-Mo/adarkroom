/**
 * World map generator — ported from script/world.js.
 */

// ── Constants ────────────────────────────────────────────

export const TILE = {
  VILLAGE: 'A', IRON_MINE: 'I', COAL_MINE: 'C', SULPHUR_MINE: 'S',
  FOREST: ';', FIELD: ',', BARRENS: '.', ROAD: '#',
  HOUSE: 'H', CAVE: 'V', TOWN: 'O', CITY: 'Y',
  OUTPOST: 'P', SHIP: 'W', BOREHOLE: 'B', BATTLEFIELD: 'F',
  SWAMP: 'M', CACHE: 'U', EXECUTIONER: 'X',
} as const;

const TILE_PROBS: Record<string, number> = {
  [TILE.FOREST]: 0.15, [TILE.FIELD]: 0.35, [TILE.BARRENS]: 0.5,
};

const STICKINESS = 0.5;

interface LandmarkDef {
  num: number; minRadius: number; maxRadius: number; scene: string; label: string;
}

const LANDMARKS: Record<string, LandmarkDef> = {
  [TILE.OUTPOST]: { num: 0, minRadius: 0, maxRadius: 0, scene: 'outpost', label: 'An Outpost' },
  [TILE.IRON_MINE]: { num: 1, minRadius: 5, maxRadius: 5, scene: 'ironmine', label: 'Iron Mine' },
  [TILE.COAL_MINE]: { num: 1, minRadius: 10, maxRadius: 10, scene: 'coalmine', label: 'Coal Mine' },
  [TILE.SULPHUR_MINE]: { num: 1, minRadius: 20, maxRadius: 20, scene: 'sulphurmine', label: 'Sulphur Mine' },
  [TILE.HOUSE]: { num: 10, minRadius: 0, maxRadius: 0, scene: 'house', label: 'An Old House' },
  [TILE.CAVE]: { num: 5, minRadius: 3, maxRadius: 10, scene: 'cave', label: 'A Damp Cave' },
  [TILE.TOWN]: { num: 10, minRadius: 10, maxRadius: 20, scene: 'town', label: 'An Abandoned Town' },
  [TILE.CITY]: { num: 20, minRadius: 20, maxRadius: 0, scene: 'city', label: 'A Ruined City' },
  [TILE.SHIP]: { num: 1, minRadius: 28, maxRadius: 28, scene: 'ship', label: 'A Crashed Starship' },
  [TILE.BOREHOLE]: { num: 10, minRadius: 15, maxRadius: 0, scene: 'borehole', label: 'A Borehole' },
  [TILE.BATTLEFIELD]: { num: 5, minRadius: 18, maxRadius: 0, scene: 'battlefield', label: 'A Battlefield' },
  [TILE.SWAMP]: { num: 1, minRadius: 15, maxRadius: 0, scene: 'swamp', label: 'A Murky Swamp' },
  [TILE.EXECUTIONER]: { num: 1, minRadius: 28, maxRadius: 28, scene: 'executioner', label: 'A Ravaged Battleship' },
};

// ── Types ────────────────────────────────────────────────

export interface Landmark {
  x: number; y: number; tileType: string; scene: string; label: string;
}

export interface GeneratedWorld {
  tiles: string[][]; landmarks: Landmark[];
}

// ── Generator ────────────────────────────────────────────

let randomSeed = 0;

function seededRandom(): number {
  randomSeed |= 0;
  randomSeed = (randomSeed + 0x6d2b79f5) | 0;
  let t = Math.imul(randomSeed ^ (randomSeed >>> 15), 1 | randomSeed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function isTerrain(tile: string): boolean {
  return tile === TILE.FOREST || tile === TILE.FIELD || tile === TILE.BARRENS;
}

function chooseTile(x: number, y: number, map: string[][], radius: number): string {
  const adjacent: (string | null)[] = [
    y > 0 ? (map[x]?.[y - 1] ?? null) : null,
    y < radius * 2 ? (map[x]?.[y + 1] ?? null) : null,
    x < radius * 2 ? (map[x + 1]?.[y] ?? null) : null,
    x > 0 ? (map[x - 1]?.[y] ?? null) : null,
  ];

  const chances: Record<string, number> = {};
  let nonSticky = 1;

  for (const adj of adjacent) {
    if (adj === TILE.VILLAGE) return TILE.FOREST;
    if (adj !== null && typeof adj === 'string') {
      chances[adj] = (chances[adj] ?? 0) + STICKINESS;
      nonSticky -= STICKINESS;
    }
  }

  for (const [tile, prob] of Object.entries(TILE_PROBS)) {
    if (isTerrain(tile)) {
      chances[tile] = (chances[tile] ?? 0) + prob * nonSticky;
    }
  }

  const list = Object.entries(chances).sort((a, b) => b[1] - a[1]);
  let cumulative = 0;
  const r = seededRandom();
  for (const [tile, prob] of list) {
    cumulative += prob;
    if (r < cumulative) return tile;
  }
  return TILE.BARRENS;
}

function setTile(map: string[][], x: number, y: number, tile: string): void {
  const row = map[x];
  if (row) row[y] = tile;
}

function getTile(map: string[][], x: number, y: number): string {
  return map[x]?.[y] ?? '';
}

function placeLandmark(
  minRadius: number, maxRadius: number, tileType: string,
  map: string[][], radius: number,
): [number, number] {
  const effMax = maxRadius > 0 ? maxRadius : radius * 1.5;
  let x = radius;
  let y = radius;
  let attempts = 0;

  while (!isTerrain(getTile(map, x, y)) && attempts < 1000) {
    attempts++;
    const r = Math.floor(seededRandom() * (effMax - minRadius)) + minRadius;
    const xDist = Math.floor(seededRandom() * r);
    const yDist = r - xDist;
    const sx = seededRandom() < 0.5 ? -1 : 1;
    const sy = seededRandom() < 0.5 ? -1 : 1;
    x = Math.max(0, Math.min(radius * 2, radius + xDist * sx));
    y = Math.max(0, Math.min(radius * 2, radius + yDist * sy));
  }

  setTile(map, x, y, tileType);
  return [x, y];
}

export function generateWorld(seed: number, radius = 30): GeneratedWorld {
  randomSeed = seed;
  const size = radius * 2 + 1;
  const map: string[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => ''));

  setTile(map, radius, radius, TILE.VILLAGE);

  for (let r = 1; r <= radius; r++) {
    for (let t = 0; t < r * 8; t++) {
      let x: number, y: number;
      if (t < 2 * r) { x = radius - r + t; y = radius - r; }
      else if (t < 4 * r) { x = radius + r; y = radius - 3 * r + t; }
      else if (t < 6 * r) { x = radius + 5 * r - t; y = radius + r; }
      else { x = radius - r; y = radius + 7 * r - t; }
      setTile(map, x, y, chooseTile(x, y, map, radius));
    }
  }

  const landmarks: Landmark[] = [];
  const effRadius = radius * 1.5;
  for (const [tileType, def] of Object.entries(LANDMARKS)) {
    const maxR = def.maxRadius > 0 ? def.maxRadius : effRadius;
    for (let i = 0; i < def.num; i++) {
      const [x, y] = placeLandmark(def.minRadius, maxR, tileType, map, radius);
      landmarks.push({ x, y, tileType, scene: def.scene, label: def.label });
    }
  }

  return { tiles: map, landmarks };
}
