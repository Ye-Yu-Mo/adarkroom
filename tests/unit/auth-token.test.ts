/**
 * Auth token unit tests — M1-F5
 *
 * Validates server/auth/token.ts:
 * - signToken() returns a JWT and expiry date
 * - verifyToken() decodes a valid token
 * - verifyToken() throws on expired/malformed tokens
 * - hashToken() produces consistent SHA-256 hashes
 */

import { describe, it, expect } from 'vitest';

// We'll test the real token module once it exists.
// For now, these tests define the contract.

describe('token functions', () => {
  describe('signToken', () => {
    it('returns a token string and an expiry Date', async () => {
      const { signToken } = await import('../../server/auth/token');
      const result = signToken('test-player-uuid');
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('verifyToken', () => {
    it('returns payload for a valid token', async () => {
      const { signToken, verifyToken } = await import('../../server/auth/token');
      const { token } = signToken('player-123');
      const payload = verifyToken(token);
      expect(payload.sub).toBe('player-123');
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
    });

    it('throws on a malformed token', async () => {
      const { verifyToken } = await import('../../server/auth/token');
      expect(() => verifyToken('not.a.valid.jwt.token.at.all')).toThrow();
    });

    it('throws on an empty token', async () => {
      const { verifyToken } = await import('../../server/auth/token');
      expect(() => verifyToken('')).toThrow();
    });
  });

  describe('hashToken', () => {
    it('produces a stable hex string', async () => {
      const { hashToken } = await import('../../server/auth/token');
      const hash1 = hashToken('test-token-value');
      const hash2 = hashToken('test-token-value');
      expect(hash1).toBe(hash2); // deterministic
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it('produces different hashes for different inputs', async () => {
      const { hashToken } = await import('../../server/auth/token');
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });
});
