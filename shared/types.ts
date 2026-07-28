/** Shared type definitions for A Dark Room multiplayer expansion.
 *  Import from this file on both client and server.
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
