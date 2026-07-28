/**
 * Guild membership middleware.
 *
 * Attaches guildId and memberRole to req for authenticated guild members.
 * Returns 403 if the player is not a member of the specified guild.
 */

import type { Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { authMiddleware, type AuthenticatedRequest } from '../auth/middleware';

export interface GuildRequest extends AuthenticatedRequest {
  guildId: string;
  memberRole: 'founder' | 'elder' | 'member';
}

export function guildMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const guildId = String(req.params.guildId ?? req.params.id ?? '');
  if (!guildId || guildId === 'undefined') {
    res.status(400).json({ ok: false, error: { code: 'MISSING_GUILD_ID', message: 'Guild ID required' } });
    return;
  }

  query(
    'SELECT role FROM guild_members WHERE guild_id = $1 AND player_id = $2',
    [guildId, req.playerId],
  ).then((result) => {
    const row = result.rows[0] as { role: string } | undefined;
    if (!row) {
      res.status(403).json({ ok: false, error: { code: 'NOT_MEMBER', message: 'Not a member of this guild' } });
      return;
    }
    (req as GuildRequest).guildId = guildId;
    (req as GuildRequest).memberRole = row.role as 'founder' | 'elder' | 'member';
    next();
  }).catch(() => {
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Database error' } });
  });
}

/** Combined auth + guild middleware for convenience. */
export const guildAuth = [authMiddleware, guildMiddleware];
