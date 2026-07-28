/**
 * Real-time minimap — Canvas overlay for multiplayer world visibility.
 *
 *   Minimap.init(centerX, centerY, viewRadius, tilePx);
 *   Minimap.setOwnPosition(x, y);
 *   Minimap.updatePlayer(id, name, x, y);
 *   Minimap.renderTiles(tiles);
 */

interface PlayerDot {
  id: string; name: string; x: number; y: number;
}

interface Viewport {
  x1: number; y1: number; x2: number; y2: number;
}

const TILE_COLORS: Record<string, string> = {
  A: '#ffdd44', I: '#888888', C: '#333333', S: '#cccc44',
  ';': '#2d5a1e', ',': '#8b7355', '.': '#4a4a4a', '#': '#6b5b3e',
  H: '#996633', V: '#1a1a4a', O: '#664422', Y: '#553322',
  P: '#448844', W: '#6666aa', B: '#334455', F: '#883333',
  M: '#225522', U: '#664400', X: '#440000',
};

const UNKNOWN = '#111111';
const OTHER_PLAYER = '#44aaff';
const SELF = '#ff6644';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let centerX = 0, centerY = 0, viewRadius = 5, tilePx = 4, mapW = 61, mapH = 61;
let ownX = 0, ownY = 0;
const players = new Map<string, PlayerDot>();
const tileCache = new Map<string, string>();

export const Minimap = {
  tileColor(type: string): string { return TILE_COLORS[type] ?? UNKNOWN; },

  init(cx: number, cy: number, radius: number, size: number, mw = 61, mh = 61): void {
    centerX = cx; centerY = cy; viewRadius = radius; tilePx = size; mapW = mw; mapH = mh;
    if (typeof document !== 'undefined') {
      canvas = canvas ?? document.createElement('canvas');
      canvas.width = (radius * 2 + 1) * size;
      canvas.height = (radius * 2 + 1) * size;
      canvas.style.position = 'absolute';
      canvas.style.top = '0'; canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '10';
      canvas.id = 'minimap-overlay';
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const mapEl = document.querySelector('#map') as HTMLElement | null;
      if (mapEl) { mapEl.style.position = 'relative'; mapEl.appendChild(canvas); }
      ctx = canvas.getContext('2d');
    }
  },

  viewportBounds(cx: number, cy: number, radius: number, mw: number, mh: number): Viewport {
    return {
      x1: Math.max(0, cx - radius), y1: Math.max(0, cy - radius),
      x2: Math.min(mw - 1, cx + radius), y2: Math.min(mh - 1, cy + radius),
    };
  },

  worldToPixel(wx: number, wy: number): { px: number; py: number } {
    const vp = this.viewportBounds(centerX, centerY, viewRadius, mapW, mapH);
    return { px: (wx - vp.x1) * tilePx + tilePx / 2, py: (wy - vp.y1) * tilePx + tilePx / 2 };
  },

  setOwnPosition(x: number, y: number): void { ownX = x; ownY = y; },
  getOwnPosition(): { x: number; y: number } { return { x: ownX, y: ownY }; },

  updatePlayer(id: string, name: string, x: number, y: number): void {
    players.set(id, { id, name, x, y });
  },
  removePlayer(id: string): void { players.delete(id); },
  getPlayerCount(): number { return players.size; },
  getPlayers(): PlayerDot[] { return [...players.values()]; },

  renderTiles(tileList: { x: number; y: number; tile_type: string }[]): void {
    for (const t of tileList) { tileCache.set(`${t.x},${t.y}`, t.tile_type); }
    this.draw();
  },

  draw(): void {
    if (!ctx || !canvas) return;
    const vp = this.viewportBounds(centerX, centerY, viewRadius, mapW, mapH);
    const w = (vp.x2 - vp.x1 + 1) * tilePx, h = (vp.y2 - vp.y1 + 1) * tilePx;
    canvas.width = w; canvas.height = h;
    ctx.clearRect(0, 0, w, h);

    // Terrain
    for (let wy = vp.y1; wy <= vp.y2; wy++) {
      for (let wx = vp.x1; wx <= vp.x2; wx++) {
        const tile = tileCache.get(`${wx},${wy}`) ?? '';
        const { px, py } = this.worldToPixel(wx, wy);
        ctx.fillStyle = this.tileColor(tile);
        ctx.fillRect(px - tilePx / 2, py - tilePx / 2, tilePx, tilePx);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(px - tilePx / 2, py - tilePx / 2, tilePx, 1);
      }
    }

    // Other players
    for (const p of players.values()) {
      if (p.x >= vp.x1 && p.x <= vp.x2 && p.y >= vp.y1 && p.y <= vp.y2) {
        const { px, py } = this.worldToPixel(p.x, p.y);
        ctx.fillStyle = OTHER_PLAYER;
        ctx.beginPath(); ctx.arc(px, py, tilePx / 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.max(3, tilePx - 1)}px monospace`;
        ctx.fillText(p.name, px + tilePx, py - tilePx / 2);
      }
    }

    // Self
    { const p = this.worldToPixel(ownX, ownY);
      ctx.fillStyle = SELF;
      ctx.beginPath(); ctx.arc(p.px, p.py, tilePx / 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(4, tilePx)}px monospace`;
      ctx.fillText('@', p.px - tilePx / 2, p.py + tilePx / 2);
    }
  },
};
