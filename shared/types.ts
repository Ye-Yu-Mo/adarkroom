/** Shared type definitions for A Dark Room multiplayer expansion.
 *  Import from this file on both client and server.
 *  @module shared/types
 */

// ── Player ──────────────────────────────────────────────

export interface Player {
  id: string;
  displayName: string;
  deviceId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface PlayerState {
  playerId: string;
  pos: { x: number; y: number };
  online: boolean;
}

// ── API ─────────────────────────────────────────────────

export interface ApiResponse<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ── Auth ────────────────────────────────────────────────

export interface RegisterRequest {
  device_id: string;
  display_name: string;
}

export interface LoginRequest {
  device_id: string;
}

export interface AuthPlayer {
  id: string;
  display_name: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  player: AuthPlayer;
}

// ── Re-export Zod schemas (imported by server) ──────────

export { registerSchema, loginSchema } from './validation';
