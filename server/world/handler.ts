/**
 * World API handlers — map tiles, landmarks, player movement.
 */

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { authMiddleware } from '../auth/middleware';
import type { AuthenticatedRequest } from '../auth/middleware';
import { diffTiles, type TileRow } from './sync';
import { Visibility } from './visibility';
import type { WsManager } from '../ws/index';

export function registerWorldRoutes(wsManager: WsManager): Router {
  const router = Router();

  router.get('/:worldId/tiles', authMiddleware, async (req, res) => {
    const worldId = req.params.worldId;
    const qx1 = req.query.x1 as string | undefined;
    const qy1 = req.query.y1 as string | undefined;
    const qx2 = req.query.x2 as string | undefined;
    const qy2 = req.query.y2 as string | undefined;
    const x1 = parseInt(qx1 ?? '0', 10);
    const y1 = parseInt(qy1 ?? '0', 10);
    const x2 = parseInt(qx2 ?? '20', 10);
    const y2 = parseInt(qy2 ?? '20', 10);

    if (!worldId || isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Invalid coordinates' } });
      return;
    }

    const result = await query(
      `SELECT x, y, tile_type, explored
       FROM world_tiles
       WHERE world_id = $1 AND x BETWEEN $2 AND $3 AND y BETWEEN $4 AND $5
       ORDER BY y, x`,
      [worldId, Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)],
    );

    const clientHash = typeof req.query.hash === 'string' ? req.query.hash : null;
    const tiles = result.rows as TileRow[];
    const diff = diffTiles(clientHash, tiles);

    res.json({ ok: true, data: { tiles: diff.changed, hash: diff.hash } });
  });

  router.get('/:worldId/landmarks', authMiddleware, async (req, res) => {
    const worldId = req.params.worldId;
    if (!worldId) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_PARAMS', message: 'Missing worldId' } });
      return;
    }

    const result = await query(
      'SELECT id, x, y, tile_type, scene, label, explored FROM landmarks WHERE world_id = $1 ORDER BY y, x',
      [worldId],
    );

    res.json({ ok: true, data: { landmarks: result.rows } });
  });

  const moveSchema = z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
  });

  router.post('/:worldId/move', authMiddleware, async (req, res) => {
    const worldId = req.params.worldId;
    const parsed = moveSchema.safeParse(req.body);
    if (!parsed.success || !worldId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid move payload' } });
      return;
    }

    const playerId = (req as AuthenticatedRequest).playerId;
    const { x, y } = parsed.data;

    const world = await query('SELECT radius FROM worlds WHERE id = $1', [worldId]);
    if (world.rows.length === 0) {
      res.status(404).json({ ok: false, error: { code: 'WORLD_NOT_FOUND', message: 'World not found' } });
      return;
    }

    const radius = (world.rows[0] as { radius: number }).radius;
    const maxCoord = radius * 2;
    if (x < 0 || x > maxCoord || y < 0 || y > maxCoord) {
      res.status(400).json({ ok: false, error: { code: 'OUT_OF_BOUNDS', message: 'Coordinates out of bounds' } });
      return;
    }

    const prev = await query(
      'SELECT x, y FROM player_positions WHERE player_id = $1 AND world_id = $2',
      [playerId, worldId],
    );
    if (prev.rows.length > 0) {
      const old = prev.rows[0] as { x: number; y: number };
      const dist = Math.abs(x - old.x) + Math.abs(y - old.y);
      if (dist !== 1) {
        res.status(400).json({ ok: false, error: { code: 'INVALID_MOVE', message: 'Must move to adjacent tile' } });
        return;
      }
    }

    // Store old position for enter/leave calculation
    const oldX = prev.rows.length > 0 ? (prev.rows[0] as { x: number }).x : x;
    const oldY = prev.rows.length > 0 ? (prev.rows[0] as { y: number }).y : y;

    await query(
      `INSERT INTO player_positions (player_id, world_id, x, y)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (player_id, world_id) DO UPDATE SET x = $3, y = $4, updated_at = now()`,
      [playerId, worldId, x, y],
    );

    // Get player display name for broadcasts
    const playerResult = await query('SELECT display_name FROM players WHERE id = $1', [playerId]);
    const displayName = (playerResult.rows[0] as { display_name: string } | undefined)?.display_name ?? 'Unknown';

    // Broadcast movement to all players in visible range of old + new position
    const VIEW_RADIUS = 5;
    const allOnline = wsManager.getOnlinePlayers();
    const oldVisible: string[] = [];
    const newVisible: string[] = [];

    for (const pid of allOnline) {
      if (pid === playerId) continue;
      const pos = await query(
        'SELECT x, y FROM player_positions WHERE player_id = $1 AND world_id = $2',
        [pid, worldId],
      );
      if (pos.rows.length === 0) continue;
      const ppos = pos.rows[0] as { x: number; y: number };
      if (Visibility.inRange(oldX, oldY, ppos.x, ppos.y, VIEW_RADIUS)) oldVisible.push(pid);
      if (Visibility.inRange(x, y, ppos.x, ppos.y, VIEW_RADIUS)) newVisible.push(pid);
    }

    // Send player:move to new visible players
    for (const pid of newVisible) {
      wsManager.send(pid, { type: 'player:move', payload: { playerId, displayName, x, y } });
    }
    // Also send to old visible (so their minimap updates smoothly)
    for (const pid of oldVisible) {
      if (!newVisible.includes(pid)) {
        wsManager.send(pid, { type: 'player:move', payload: { playerId, displayName, x, y } });
        wsManager.send(pid, { type: 'player:leave', payload: { playerId } });
      }
    }

    // Enter/leave detection
    const { entered, left } = Visibility.diffPlayers(oldVisible, newVisible);
    for (const pid of entered) {
      wsManager.send(pid, {
        type: 'player:enter',
        payload: { playerId, displayName, pos: { x, y } },
      });
    }
    for (const pid of left) {
      wsManager.send(pid, { type: 'player:leave', payload: { playerId } });
    }

    res.json({ ok: true, data: { x, y } });
  });

  return router;
}
