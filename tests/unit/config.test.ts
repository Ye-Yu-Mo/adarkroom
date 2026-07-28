/**
 * Configuration module tests — M1-F2
 *
 * Validates that server/config.ts:
 * - Parses environment variables through Zod schemas
 * - Provides sensible defaults for optional values
 * - Rejects invalid values with clear error messages
 * - Exports a type-safe config object
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

/** Clear all env vars that config.ts reads, so each test starts fresh. */
function clearConfigEnv() {
  delete process.env.DATABASE_URL;
  delete process.env.DB_POOL_SIZE;
  delete process.env.JWT_SECRET;
  delete process.env.JWT_TOKEN_EXPIRY;
  delete process.env.PORT;
  delete process.env.WS_PORT;
  delete process.env.WS_HEARTBEAT_INTERVAL;
  delete process.env.CORS_ORIGIN;
  delete process.env.NODE_ENV;
}

describe('server/config.ts', () => {
  // Reset modules and clear env before each test so every
  // `await import()` gets a fresh config parse.
  beforeEach(() => {
    vi.resetModules();
    clearConfigEnv();
  });

  describe('default values', () => {
    it('uses defaults when no env vars are set', async () => {
      const { config } = await import('../../server/config');
      expect(config.port).toBe(3000);
      expect(config.ws.port).toBe(3001);
      expect(config.cors.origin).toBe('http://localhost:8080');
      expect(config.env).toBe('development');
    });

    it('uses DATABASE_URL default for local Docker PostgreSQL', async () => {
      const { config } = await import('../../server/config');
      expect(config.db.url).toBe(
        'postgresql://adr:adarkroom_dev_pw@localhost:5432/adarkroom_dev',
      );
    });
  });

  describe('environment variable overrides', () => {
    it('reads PORT from environment', async () => {
      process.env.PORT = '4200';
      const { config } = await import('../../server/config');
      expect(config.port).toBe(4200);
    });

    it('reads DATABASE_URL from environment', async () => {
      process.env.DATABASE_URL = 'postgresql://prod:secret@db.example.com:5432/adarkroom';
      const { config } = await import('../../server/config');
      expect(config.db.url).toBe('postgresql://prod:secret@db.example.com:5432/adarkroom');
    });

    it('reads JWT_SECRET from environment', async () => {
      process.env.JWT_SECRET = 'super-secret-key-123';
      const { config } = await import('../../server/config');
      expect(config.auth.jwtSecret).toBe('super-secret-key-123');
    });

    it('reads CORS_ORIGIN from environment', async () => {
      process.env.CORS_ORIGIN = 'https://adarkroom.example.com';
      const { config } = await import('../../server/config');
      expect(config.cors.origin).toBe('https://adarkroom.example.com');
    });

    it('reads NODE_ENV from environment', async () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'prod-secret-override';
      const { config } = await import('../../server/config');
      expect(config.env).toBe('production');
    });

    it('reads WS_PORT from environment', async () => {
      process.env.WS_PORT = '4201';
      const { config } = await import('../../server/config');
      expect(config.ws.port).toBe(4201);
    });
  });

  describe('validation', () => {
    it('rejects invalid PORT', async () => {
      process.env.PORT = 'not-a-number';
      await expect(import('../../server/config')).rejects.toThrow();
    });

    it('rejects empty JWT_SECRET in production', async () => {
      process.env.NODE_ENV = 'production';
      // Don't set JWT_SECRET — default 'change-me-in-production' triggers the guard
      await expect(import('../../server/config')).rejects.toThrow(/JWT_SECRET/);
    });
  });

  describe('config shape', () => {
    it('exports db section with url and poolSize', async () => {
      const { config } = await import('../../server/config');
      expect(typeof config.db.url).toBe('string');
      expect(typeof config.db.poolSize).toBe('number');
    });

    it('exports auth section with jwtSecret and tokenExpiry', async () => {
      const { config } = await import('../../server/config');
      expect(typeof config.auth.jwtSecret).toBe('string');
      expect(typeof config.auth.tokenExpiry).toBe('string');
    });

    it('exports ws section with port and heartbeatInterval', async () => {
      const { config } = await import('../../server/config');
      expect(typeof config.ws.port).toBe('number');
      expect(typeof config.ws.heartbeatInterval).toBe('number');
    });

    it('exports cors section with origin', async () => {
      const { config } = await import('../../server/config');
      expect(typeof config.cors.origin).toBe('string');
    });

    it('exports env as string union', async () => {
      const { config } = await import('../../server/config');
      expect(['development', 'production', 'test']).toContain(config.env);
    });
  });
});

describe('.env.example', () => {
  it('exists', () => {
    expect(existsSync(join(ROOT, '.env.example'))).toBe(true);
  });

  it('documents all required environment variables', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    expect(content).toContain('DATABASE_URL');
    expect(content).toContain('JWT_SECRET');
    expect(content).toContain('PORT');
    expect(content).toContain('WS_PORT');
    expect(content).toContain('CORS_ORIGIN');
    expect(content).toContain('NODE_ENV');
  });

  it('does not contain real secrets (only placeholders)', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8');
    expect(content.toLowerCase()).not.toContain('my-real-secret');
    expect(content.toLowerCase()).not.toContain('production-secret');
  });
});

describe('.gitignore env protection', () => {
  it('gitignore prevents committing .env files', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.env');
  });
});
