/**
 * Shared type definitions tests — M1-F8
 *
 * Verifies that shared/types.ts and shared/protocol.ts
 * export all required types matching the project spec.
 */

import { describe, it, expect } from 'vitest';
import type {
  Player,
  PlayerState,
  ApiResponse,
  ApiError,
  ApiResult,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from '../../shared/types';
import { WS_CLIENT_MESSAGES, WS_SERVER_MESSAGES } from '../../shared/protocol';
import type { ClientMessage, ServerMessage } from '../../shared/protocol';

describe('shared/types.ts', () => {
  it('exports Player type with correct fields', () => {
    const p: Player = {
      id: 'uuid-1',
      displayName: 'Wanderer',
      deviceId: 'dev-1',
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    expect(p.displayName).toBe('Wanderer');
    expect(p.deviceId).toBe('dev-1');
  });

  it('exports PlayerState with pos', () => {
    const ps: PlayerState = {
      playerId: 'p1',
      online: true,
      pos: { x: 10, y: 20 },
    };
    expect(ps.pos.x).toBe(10);
  });

  it('exports ApiResponse<T> and ApiError discriminated union', () => {
    const ok: ApiResponse<{ name: string }> = {
      ok: true,
      data: { name: 'test' },
    };
    const err: ApiError = {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'gone' },
    };
    expect(ok.ok).toBe(true);
    expect(err.ok).toBe(false);
  });

  it('exports ApiResult<T> as union', () => {
    const r: ApiResult<{ x: number }> = { ok: true, data: { x: 1 } };
    expect(r.ok).toBe(true);
  });

  it('exports RegisterRequest and LoginRequest', () => {
    const reg: RegisterRequest = {
      device_id: 'dev-1',
      display_name: 'Player',
    };
    const login: LoginRequest = {
      device_id: 'dev-2',
    };
    expect(reg.display_name).toBe('Player');
    expect(login.device_id).toBe('dev-2');
  });

  it('exports AuthResponse with token and player', () => {
    const res: AuthResponse = {
      token: 'eyJ...',
      player: {
        id: 'p1',
        display_name: 'Name',
        created_at: '2024-01-01',
      },
    };
    expect(res.token).toBe('eyJ...');
    expect(res.player.display_name).toBe('Name');
  });
});

describe('shared/protocol.ts', () => {
  it('exports all known message type strings', () => {
    expect(WS_CLIENT_MESSAGES).toContain('player:move');
    expect(WS_SERVER_MESSAGES).toContain('connected');
    expect(WS_SERVER_MESSAGES).toContain('ping');
    expect(WS_SERVER_MESSAGES).toContain('guild:resource_update');
  });

  it('exports client→server message types', () => {
    const msg: ClientMessage = {
      type: 'player:move',
      payload: { x: 30, y: 40 },
    };
    expect(msg.type).toBe('player:move');
  });

  it('exports server→client message types', () => {
    const msg: ServerMessage = {
      type: 'connected',
      seq: 1,
      ts: Date.now(),
      payload: { playerId: 'p1' },
    };
    expect(msg.type).toBe('connected');
    expect(msg.seq).toBe(1);
  });
});
