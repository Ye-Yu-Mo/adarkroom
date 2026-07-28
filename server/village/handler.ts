/**
 * Guild (village) REST API handlers.
 *
 * Endpoints:
 *   POST   /api/v1/guilds                        — create guild
 *   GET    /api/v1/guilds/:id                     — get guild details (members, buildings, resources, workers)
 *   POST   /api/v1/guilds/:id/join                — join guild via invite code
 *   POST   /api/v1/guilds/:id/leave               — leave guild
 *   POST   /api/v1/guilds/:id/build               — build/upgrade building
 *   POST   /api/v1/guilds/:id/workers             — assign workers
 *   POST   /api/v1/guilds/:id/resources/withdraw  — withdraw resources
 *   POST   /api/v1/guilds/:id/members/:playerId/role — change member role (founder only)
 */

import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { query } from '../db/pool';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware';
import { guildMiddleware, type GuildRequest } from './guild-middleware';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function guildChain(): any[] { return [authMiddleware, guildMiddleware]; }

export function registerGuildRoutes(): Router {
  const router = Router();

  // ── Create guild ──────────────────────────────────────
  const createSchema = z.object({ name: z.string().min(1).max(48) });
  router.post('/', authMiddleware, async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Name required (1-48 chars)' } }); return; }
    const playerId = (req as unknown as AuthenticatedRequest).playerId;
    const name = parsed.data.name;

    // Generate unique 6-char invite code
    let inviteCode = '';
    for (let i = 0; i < 5; i++) {
      inviteCode = randomBytes(4).toString('hex').substring(0, 6).toUpperCase();
      const existing = await query('SELECT id FROM guilds WHERE invite_code = $1', [inviteCode]);
      if (existing.rows.length === 0) break;
    }

    const result = await query(
      'INSERT INTO guilds (name, invite_code, founder_id) VALUES ($1, $2, $3) RETURNING id, invite_code, created_at',
      [name, inviteCode, playerId],
    );
    const guild = result.rows[0] as { id: string; invite_code: string; created_at: string };
    await query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'founder')", [guild.id, playerId]);

    res.status(201).json({ ok: true, data: { id: guild.id, name, invite_code: guild.invite_code, created_at: guild.created_at } });
  });

  // ── Get guild details ─────────────────────────────────
  router.get('/:id', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const guildId = (req as unknown as GuildRequest).guildId;

    const [guild, members, buildings, resources, workers] = await Promise.all([
      query('SELECT id, name, invite_code, created_at FROM guilds WHERE id = $1', [guildId]),
      query('SELECT gm.player_id, p.display_name, gm.role, gm.joined_at FROM guild_members gm JOIN players p ON gm.player_id = p.id WHERE gm.guild_id = $1 ORDER BY gm.joined_at', [guildId]),
      query('SELECT building_name, level FROM guild_buildings WHERE guild_id = $1', [guildId]),
      query('SELECT resource_name, quantity, daily_limit FROM guild_resources WHERE guild_id = $1', [guildId]),
      query('SELECT worker_type, count FROM guild_workers WHERE guild_id = $1', [guildId]),
    ]);

    if (guild.rows.length === 0) { res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Guild not found' } }); return; }

    const g = guild.rows[0] as Record<string, unknown>;
    res.json({
      ok: true,
      data: {
        id: g.id, name: g.name, invite_code: g.invite_code, created_at: g.created_at,
        members: members.rows, buildings: buildings.rows, resources: resources.rows, workers: workers.rows,
      },
    });
  });

  // ── Join guild ─────────────────────────────────────────
  const joinSchema = z.object({ invite_code: z.string().length(6) });
  router.post('/:id/join', authMiddleware, async (req, res) => {
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invite code required (6 chars)' } }); return; }
    const playerId = (req as unknown as AuthenticatedRequest).playerId;
    const guildId = req.params.id;
    if (!guildId) { res.status(400).json({ ok: false, error: { code: 'MISSING_ID', message: 'Guild ID required' } }); return; }

    const g = await query('SELECT id FROM guilds WHERE id = $1 AND invite_code = $2', [guildId, parsed.data.invite_code]);
    if (g.rows.length === 0) { res.status(404).json({ ok: false, error: { code: 'INVALID_CODE', message: 'Invalid guild ID or invite code' } }); return; }

    try {
      await query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1, $2, 'member')", [guildId, playerId]);
      res.json({ ok: true, data: { guild_id: guildId } });
    } catch { res.status(409).json({ ok: false, error: { code: 'ALREADY_MEMBER', message: 'Already a member of this guild' } }); }
  });

  // ── Leave guild ────────────────────────────────────────
  router.post('/:id/leave', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const r = req as unknown as GuildRequest;
    if (r.memberRole === 'founder') { res.status(400).json({ ok: false, error: { code: 'FOUNDER_CANT_LEAVE', message: 'Transfer ownership before leaving' } }); return; }
    await query('DELETE FROM guild_members WHERE guild_id = $1 AND player_id = $2', [r.guildId, r.playerId]);
    res.json({ ok: true });
  });

  // ── Build/upgrade ──────────────────────────────────────
  const buildSchema = z.object({ building_name: z.string().min(1).max(48), level: z.number().int().positive().optional() });
  router.post('/:id/build', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const r = req as unknown as GuildRequest;
    if (r.memberRole === 'member') { res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only elder+ can build' } }); return; }
    const parsed = buildSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'building_name required' } }); return; }

    const { building_name } = parsed.data;
    await query(
      `INSERT INTO guild_buildings (guild_id, building_name, level) VALUES ($1, $2, 1)
       ON CONFLICT (guild_id, building_name) DO UPDATE SET level = guild_buildings.level + 1, built_at = now()`,
      [r.guildId, building_name],
    );
    res.json({ ok: true, data: { building: building_name } });
  });

  // ── Assign workers ─────────────────────────────────────
  const workerSchema = z.object({ worker_type: z.string().min(1).max(48), count: z.number().int().min(0) });
  router.post('/:id/workers', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const r = req as unknown as GuildRequest;
    if (r.memberRole === 'member') { res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only elder+ can assign workers' } }); return; }
    const parsed = workerSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'worker_type and count required' } }); return; }

    await query(
      `INSERT INTO guild_workers (guild_id, worker_type, count) VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, worker_type) DO UPDATE SET count = $3, updated_at = now()`,
      [r.guildId, parsed.data.worker_type, parsed.data.count],
    );
    res.json({ ok: true, data: { worker_type: parsed.data.worker_type, count: parsed.data.count } });
  });

  // ── Withdraw resources ─────────────────────────────────
  const withdrawSchema = z.object({ resource_name: z.string().min(1).max(48), amount: z.number().positive() });
  router.post('/:id/resources/withdraw', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const r = req as unknown as GuildRequest;
    const parsed = withdrawSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'resource_name and amount required' } }); return; }

    const { resource_name, amount } = parsed.data;
    const current = await query('SELECT quantity, daily_limit FROM guild_resources WHERE guild_id = $1 AND resource_name = $2 FOR UPDATE', [r.guildId, resource_name]);
    if (current.rows.length === 0) { res.status(404).json({ ok: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Resource not found in guild pool' } }); return; }

    const row = current.rows[0] as { quantity: number; daily_limit: number };
    if (row.quantity < amount) { res.status(400).json({ ok: false, error: { code: 'INSUFFICIENT', message: 'Not enough in resource pool' } }); return; }
    if (amount > row.daily_limit) { res.status(400).json({ ok: false, error: { code: 'DAILY_LIMIT', message: 'Exceeds daily withdrawal limit' } }); return; }

    await query('UPDATE guild_resources SET quantity = quantity - $1, daily_limit = daily_limit - $1, updated_at = now() WHERE guild_id = $2 AND resource_name = $3', [amount, r.guildId, resource_name]);
    res.json({ ok: true, data: { resource_name, withdrawn: amount, remaining_quantity: row.quantity - amount } });
  });

  // ── Change role (founder only) ─────────────────────────
  const roleSchema = z.object({ role: z.enum(['elder', 'member']) });
  router.post('/:id/members/:playerId/role', // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    ...guildChain(), async (req, res) => {
    const r = req as unknown as GuildRequest;
    if (r.memberRole !== 'founder') { res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: 'Only founder can change roles' } }); return; }
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Role must be elder or member' } }); return; }

    await query('UPDATE guild_members SET role = $1 WHERE guild_id = $2 AND player_id = $3', [parsed.data.role, r.guildId, req.params.playerId]);
    res.json({ ok: true });
  });

  return router;
}
