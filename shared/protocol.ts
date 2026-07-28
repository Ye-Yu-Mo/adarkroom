/** WebSocket protocol message types */

// ── Client → Server ─────────────────────────────────────

export interface MovePayload {
  x: number;
  y: number;
}

// ── Server → Client ─────────────────────────────────────

export type WSMessage =
  | { type: 'ping'; seq: number; ts: number }
  | { type: 'pong'; seq: number; ts: number }
  | { type: 'sync'; ack: number };
