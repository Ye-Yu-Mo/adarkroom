/**
 * JWT token utilities.
 *
 *   import { signToken, verifyToken, hashToken } from './auth/token';
 *   const { token, expiresAt } = signToken(playerId);
 *   const payload = verifyToken(token);  // { sub: playerId, iat, exp }
 *   const hash = hashToken(token);       // SHA-256 hex for DB storage
 */

import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'node:crypto';
import { config } from '../config';

// ── Sign ─────────────────────────────────────────────────

export function signToken(playerId: string): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + parseDuration(config.auth.tokenExpiry));
  const jti = randomUUID();
  const token = jwt.sign(
    { sub: playerId, jti },
    config.auth.jwtSecret,
    { expiresIn: parseDuration(config.auth.tokenExpiry) / 1000 },
  );
  return { token, expiresAt };
}

// ── Verify ───────────────────────────────────────────────

export function verifyToken(token: string): jwt.JwtPayload {
  const decoded = jwt.verify(token, config.auth.jwtSecret);
  if (typeof decoded === 'string') {
    throw new Error('Unexpected string payload from JWT');
  }
  return decoded;
}

// ── Hash (for DB storage) ────────────────────────────────

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Helpers ──────────────────────────────────────────────

/** Parse a duration string like '24h', '7d', '60m' into milliseconds. */
function parseDuration(dur: string): number {
  const match = /^(\d+)([smhd])$/.exec(dur);
  if (!match || match.length < 3) {
    throw new Error(`Invalid duration format: ${dur}. Expected e.g. '24h', '7d', '60m'.`);
  }
  const value = parseInt(match[1] ?? '0', 10);
  const unit = match[2] ?? 'h';
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default:  return value * 60 * 60 * 1000; // fallback to hours
  }
}
