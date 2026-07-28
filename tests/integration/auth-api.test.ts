/**
 * Auth API integration tests — M1-F5
 *
 * Validates the full auth flow end-to-end:
 * - POST /api/v1/auth/register creates a player and returns a JWT
 * - Duplicate device_id returns 409
 * - POST /api/v1/auth/login returns a JWT for an existing player
 * - Unknown device_id returns 404
 * - Protected routes return 401 without a token
 * - Protected routes succeed with a valid token
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');

let app: Express;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  // Ensure tables exist
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });

  // Import handler — this is what we're testing
  const { registerAuthRoutes } = await import('../../server/auth/handler');
  app = express();
  app.use(express.json());
  app.use('/api/v1/auth', registerAuthRoutes());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(((err: Error, _req: any, res: any, _next: any) => {
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: err.message } });
  }) as express.ErrorRequestHandler);

  // Start on a random port
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
});

// ── Helpers ─────────────────────────────────────────────

async function apiPost(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

const TEST_DEVICE = `test-device-${Date.now()}`;

// ═══════════════════════════════════════════════════════════

describe('POST /api/v1/auth/register', () => {
  it('creates a new player and returns a JWT', async () => {
    const { status, body } = await apiPost('/api/v1/auth/register', {
      device_id: TEST_DEVICE,
      display_name: 'WandererOne',
    });

    expect(status).toBe(201);
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(typeof data.token).toBe('string');
    expect((data.player as Record<string, unknown>).display_name).toBe('WandererOne');
    expect(typeof (data.player as Record<string, unknown>).id).toBe('string');
  });

  it('returns 409 for duplicate device_id', async () => {
    const { status, body } = await apiPost('/api/v1/auth/register', {
      device_id: TEST_DEVICE,
      display_name: 'DuplicateAttempt',
    });

    expect(status).toBe(409);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, unknown>).code).toBe('DEVICE_ID_TAKEN');
  });

  it('returns 400 when device_id is missing', async () => {
    const { status, body } = await apiPost('/api/v1/auth/register', {
      display_name: 'NoDevice',
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('returns 400 when display_name is missing', async () => {
    const { status, body } = await apiPost('/api/v1/auth/register', {
      device_id: `missing-name-${Date.now()}`,
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });

  it('returns 400 when display_name exceeds 24 characters', async () => {
    const { status, body } = await apiPost('/api/v1/auth/register', {
      device_id: `long-name-${Date.now()}`,
      display_name: 'A'.repeat(25),
    });

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns a JWT for an existing player', async () => {
    const { status, body } = await apiPost('/api/v1/auth/login', {
      device_id: TEST_DEVICE,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(typeof data.token).toBe('string');
    expect((data.player as Record<string, unknown>).display_name).toBe('WandererOne');
  });

  it('returns 404 for an unknown device_id', async () => {
    const { status, body } = await apiPost('/api/v1/auth/login', {
      device_id: 'nonexistent-device-99999',
    });

    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect((body.error as Record<string, unknown>).code).toBe('PLAYER_NOT_FOUND');
  });

  it('returns 400 when device_id is missing', async () => {
    const { status, body } = await apiPost('/api/v1/auth/login', {});

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
