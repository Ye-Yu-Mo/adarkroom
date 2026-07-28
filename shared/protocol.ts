/** WebSocket protocol message type definitions.
 *  Single source of truth for all WS message shapes.
 *  @module shared/protocol
 */

// ── Message type constants ──────────────────────────────

/** Messages sent by the client. */
export const WS_CLIENT_MESSAGES = [
  'player:move',
  'pong',
] as const;

/** Messages sent by the server. */
export const WS_SERVER_MESSAGES = [
  'ping',
  'connected',
  'player:enter',
  'player:leave',
  'player:move',
  'world:tile_update',
  'guild:resource_update',
  'guild:building_complete',
  'guild:member_online',
  'realm:ruin_spawn',
] as const;

// ── Client → Server ─────────────────────────────────────

export interface MovePayload {
  x: number;
  y: number;
}

/** All messages the client can send. */
export type ClientMessage =
  | { type: 'player:move'; payload: MovePayload }
  | { type: 'pong' };

// ── Server → Client ─────────────────────────────────────

/** All messages the server can send — each includes seq and ts. */
export type ServerMessage =
  | { type: 'ping'; seq: number; ts: number }
  | { type: 'connected'; seq: number; ts: number; payload: { playerId: string } }
  | { type: 'player:enter'; seq: number; ts: number; payload: { playerId: string; displayName: string; pos: { x: number; y: number } } }
  | { type: 'player:leave'; seq: number; ts: number; payload: { playerId: string } }
  | { type: 'player:move'; seq: number; ts: number; payload: { playerId: string; x: number; y: number } }
  | { type: 'world:tile_update'; seq: number; ts: number; payload: { x: number; y: number; tile: string } }
  | { type: 'guild:resource_update'; seq: number; ts: number; payload: Record<string, unknown> }
  | { type: 'guild:building_complete'; seq: number; ts: number; payload: { building: string; level: number } }
  | { type: 'guild:member_online'; seq: number; ts: number; payload: { playerId: string; online: boolean } }
  | { type: 'realm:ruin_spawn'; seq: number; ts: number; payload: { x: number; y: number; playerName: string } };

// ── Wire format ─────────────────────────────────────────

/** A raw message travelling over the wire (used for deserialization). */
export interface WireMessage {
  type: string;
  seq: number;
  ts: number;
  payload?: unknown;
}
