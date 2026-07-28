/**
 * Invite code system tests — M3-F6
 *
 * Validates invite code generation and join flow.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');

let app: ReturnType<typeof express>;
let server: Server;
let baseUrl: string;
let tokens: string[] = [];
let guildId = '';
let inviteCode = '';

beforeAll(async () => {
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });

  const { startServer } = await import('../../server/index');
  const result = await startServer();
  server = result.httpServer;
  baseUrl = `http://localhost:${result.port}`;

  // Create 3 test players
  for (const name of ['Alice', 'Bob', 'Charlie']) {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: `invite-test-${name}-${Date.now()}`, display_name: name }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { token: string } };
    if (body.data?.token) tokens.push(body.data.token);
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => { server.close(() => resolve()); });
});

describe('invite code', () => {
  it('create guild returns 6-char invite code', async () => {
    const res = await fetch(`${baseUrl}/api/v1/guilds`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'TestClan' }),
    });
    const body = (await res.json()) as { ok: boolean; data?: { id: string; invite_code: string } };
    expect(res.status).toBe(201);
    expect(body.data?.invite_code).toHaveLength(6);
    expect(/^[A-F0-9]+$/.test(body.data?.invite_code ?? '')).toBe(true);
    guildId = body.data!.id;
    inviteCode = body.data!.invite_code;
  });

  it('join with correct code succeeds', async () => {
    const res = await fetch(`${baseUrl}/api/v1/guilds/${guildId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[1]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inviteCode }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('join with wrong code fails', async () => {
    const res = await fetch(`${baseUrl}/api/v1/guilds/${guildId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[2]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: 'ZZZZZZ' }),
    });
    expect(res.status).toBe(404);
  });

  it('duplicate join returns 409', async () => {
    const res = await fetch(`${baseUrl}/api/v1/guilds/${guildId}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens[1]}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inviteCode }),
    });
    expect(res.status).toBe(409);
  });

  it('guild details show both members', async () => {
    const res = await fetch(`${baseUrl}/api/v1/guilds/${guildId}`, {
      headers: { Authorization: `Bearer ${tokens[0]}` },
    });
    const body = (await res.json()) as { ok: boolean; data: { members: Array<{ player_id: string; role: string }> } };
    expect(body.data.members).toHaveLength(2);
    const roles = body.data.members.map(m => m.role).sort();
    expect(roles).toEqual(['founder', 'member']);
  });
});
