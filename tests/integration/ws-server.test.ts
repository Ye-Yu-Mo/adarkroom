/**
 * WebSocket server integration tests — M1-F6
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import type { Server } from 'node:http';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');

let httpBase: string;
let wsBase: string;
let validToken: string;
let testDeviceId: string;
let httpServer: Server;

beforeAll(async () => {
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });

  testDeviceId = `ws-test-${Date.now()}`;
  const { startServer } = await import('../../server/index');

  const result = await startServer();
  httpServer = result.httpServer;
  const port = result.port;
  httpBase = `http://localhost:${port}`;
  wsBase = `ws://localhost:${port}`;

  const res = await fetch(`${httpBase}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: testDeviceId, display_name: 'WsTester' }),
  });
  const body = (await res.json()) as { ok: boolean; data?: { token: string } };
  if (body.data?.token) {
    validToken = body.data.token;
  } else {
    throw new Error('Failed to get token');
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    httpServer.close(() => {
      resolve();
    });
  });
});

// ── Helpers ─────────────────────────────────────────────

interface ConnResult {
  ws: WebSocket;
  messages: unknown[];
}

function connect(token?: string): Promise<ConnResult> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];
    const url = token ? `${wsBase}/ws?token=${token}` : `${wsBase}/ws`;

    const ws = new WebSocket(url);
    ws.on('message', (raw) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      messages.push(JSON.parse(raw.toString()));
    });
    ws.on('open', () => {
      resolve({ ws, messages });
    });
    ws.on('error', (err) => {
      reject(err);
    });

    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.close();
        reject(new Error('Connection timed out'));
      }
    }, 3000);
  });
}

// ═══════════════════════════════════════════════════════════

describe('WebSocket connection', () => {
  it('accepts connection with a valid JWT', async () => {
    const { ws, messages } = await connect(validToken);
    expect(ws.readyState).toBe(WebSocket.OPEN);

    const conMsg = messages.find(
      (m: unknown) => (m as { type: string }).type === 'connected',
    );
    expect(conMsg).toBeDefined();

    ws.close();
  });

  it('rejects connection without a token', async () => {
    await expect(connect()).rejects.toThrow();
  });

  it('rejects connection with an invalid token', async () => {
    await expect(connect('not.a.valid.jwt')).rejects.toThrow();
  });
});

describe('message delivery', () => {
  it('delivers connected message with sequence number', async () => {
    const { ws, messages } = await connect(validToken);

    const conMsg = messages.find(
      (m: unknown) => (m as { type: string }).type === 'connected',
    ) as { type: string; seq: number; ts: number; payload: { playerId: string } } | undefined;
    expect(conMsg).toBeDefined();
    if (!conMsg) return;
    expect(typeof conMsg.seq).toBe('number');
    expect(typeof conMsg.ts).toBe('number');
    expect(conMsg.ts).toBeGreaterThan(0);
    expect(typeof conMsg.payload.playerId).toBe('string');

    ws.close();
  });
});

describe('connection lifecycle', () => {
  it('tracks player connect and disconnect', async () => {
    const { ws } = await connect(validToken);

    const healthRes = await fetch(`${httpBase}/api/health`);
    const health = (await healthRes.json()) as { online: number };
    expect(health.online).toBeGreaterThanOrEqual(1);

    ws.close();
    await new Promise((r) => {
      setTimeout(r, 300);
    });

    const healthRes2 = await fetch(`${httpBase}/api/health`);
    const health2 = (await healthRes2.json()) as { online: number };
    expect(health2.online).toBe(0);
  });
});
