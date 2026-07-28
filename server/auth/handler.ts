/**
 * Auth API handlers — register and login.
 *
 *   POST /api/v1/auth/register  { device_id, display_name }  → 201 + JWT
 *   POST /api/v1/auth/login     { device_id }                 → 200 + JWT
 */

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { signToken, hashToken } from './token';

// ── Validation schemas ───────────────────────────────────

const registerSchema = z.object({
  device_id: z.string().min(1).max(64),
  display_name: z.string().min(1).max(24),
});

const loginSchema = z.object({
  device_id: z.string().min(1).max(64),
});

// ── Router factory ───────────────────────────────────────

export function registerAuthRoutes(): Router {
  const router = Router();

  // POST /api/v1/auth/register
  router.post('/register', async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
      return;
    }

    const { device_id, display_name } = parsed.data;

    // Check if device_id is already taken
    const existing = await query(
      'SELECT id FROM players WHERE device_id = $1 AND deleted_at IS NULL',
      [device_id],
    );
    if (existing.rows.length > 0) {
      res.status(409).json({
        ok: false,
        error: {
          code: 'DEVICE_ID_TAKEN',
          message: 'This device is already registered. Use /login instead.',
        },
      });
      return;
    }

    // Create player
    const result = await query(
      `INSERT INTO players (display_name, device_id)
       VALUES ($1, $2)
       RETURNING id, display_name, created_at`,
      [display_name, device_id],
    );
    const player = result.rows[0] as { id: string; display_name: string; created_at: string };

    // Issue token
    const { token, expiresAt } = signToken(player.id);
    const tokenHash = hashToken(token);

    // Store token hash
    await query(
      `INSERT INTO auth_tokens (player_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [player.id, tokenHash, expiresAt],
    );

    res.status(201).json({
      ok: true,
      data: {
        token,
        player: {
          id: player.id,
          display_name: player.display_name,
          created_at: player.created_at,
        },
      },
    });
  });

  // POST /api/v1/auth/login
  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
      return;
    }

    const { device_id } = parsed.data;

    // Find player
    const result = await query(
      'SELECT id, display_name, created_at FROM players WHERE device_id = $1 AND deleted_at IS NULL',
      [device_id],
    );
    const player = result.rows[0] as { id: string; display_name: string; created_at: string } | undefined;

    if (!player) {
      res.status(404).json({
        ok: false,
        error: {
          code: 'PLAYER_NOT_FOUND',
          message: 'No player found with this device ID. Use /register first.',
        },
      });
      return;
    }

    // Update last_seen_at
    await query('UPDATE players SET last_seen_at = now() WHERE id = $1', [player.id]);

    // Issue token
    const { token, expiresAt } = signToken(player.id);
    const tokenHash = hashToken(token);

    await query(
      `INSERT INTO auth_tokens (player_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [player.id, tokenHash, expiresAt],
    );

    res.status(200).json({
      ok: true,
      data: {
        token,
        player: {
          id: player.id,
          display_name: player.display_name,
          created_at: player.created_at,
        },
      },
    });
  });

  return router;
}
