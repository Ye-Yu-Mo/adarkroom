/**
 * WebSocket server — connection manager with auth, heartbeat, and message sequencing.
 *
 *   import { createWsServer, WsManager } from './ws';
 *   const wss = createWsServer(httpServer);
 *   const mgr = new WsManager();
 *
 *   mgr.send(playerId, { type: 'world:tile_update', payload: { ... } });
 *   mgr.broadcast(['p1', 'p2'], { type: 'player:enter', payload: { ... } });
 */

import { WebSocketServer } from 'ws';
import type { Server, IncomingMessage } from 'node:http';
import { verifyToken } from '../auth/token';

// ── Types ────────────────────────────────────────────────

export interface WSMessage {
  type: string;
  seq: number;
  ts: number;
  payload?: Record<string, unknown>;
}

/** Minimal interface that any WebSocket-like connection must satisfy. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

// ── Connection Manager ───────────────────────────────────

export class WsManager {
  private connections = new Map<string, SocketLike>();
  private seq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPongs = new Set<string>(); // playerIds awaiting pong response

  addConnection(playerId: string, ws: SocketLike): void {
    // Close old connection if this player reconnects
    const old = this.connections.get(playerId);
    if (old?.readyState === 1) {
      old.close(1000, 'Reconnected from another session');
    }
    this.connections.set(playerId, ws);
  }

  removeConnection(playerId: string): void {
    this.connections.delete(playerId);
    this.pendingPongs.delete(playerId);
  }

  isOnline(playerId: string): boolean {
    return (this.connections.get(playerId)?.readyState ?? 0) === 1;
  }

  getOnlineCount(): number {
    return [...this.connections.values()].filter((ws) => ws.readyState === 1).length;
  }

  getOnlinePlayers(): string[] {
    return [...this.connections.entries()]
      .filter(([, ws]) => ws.readyState === 1)
      .map(([id]) => id);
  }

  // ── Sending ────────────────────────────────────────────

  send(playerId: string, msg: Omit<WSMessage, 'seq' | 'ts'>): void {
    const ws = this.connections.get(playerId);
    if (ws?.readyState !== 1) return;
    const full: WSMessage = { ...msg, seq: ++this.seq, ts: Date.now() };
    ws.send(JSON.stringify(full));
  }

  broadcast(playerIds: string[], msg: Omit<WSMessage, 'seq' | 'ts'>): void {
    for (const id of playerIds) {
      this.send(id, msg);
    }
  }

  broadcastAll(msg: Omit<WSMessage, 'seq' | 'ts'>): void {
    for (const id of this.getOnlinePlayers()) {
      this.send(id, msg);
    }
  }

  // ── Heartbeat ──────────────────────────────────────────

  startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      // Check pending pongs from last cycle
      for (const id of this.pendingPongs) {
        const ws = this.connections.get(id);
        if (ws) {
          // eslint-disable-next-line no-console
          console.log(`[ws] heartbeat timeout for player ${id}, closing`);
          ws.close(4001, 'Heartbeat timeout');
          this.removeConnection(id);
        }
      }
      this.pendingPongs.clear();

      // Send ping to all online players
      for (const [id, ws] of this.connections) {
        if (ws.readyState === 1) {
          this.pendingPongs.add(id);
          this.send(id, { type: 'ping', payload: {} });
        }
      }
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** Call when a player sends pong — clears their pending-pong flag. */
  handlePong(playerId: string): void {
    this.pendingPongs.delete(playerId);
  }
}

// ── Server factory ───────────────────────────────────────

export function createWsServer(httpServer: Server, mgr: WsManager, path = '/ws'): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (url.pathname !== path) {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let playerId: string;
    try {
      const payload = verifyToken(token);
      if (!payload.sub) throw new Error('No subject in token');
      playerId = payload.sub;
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      mgr.addConnection(playerId, ws);

      // Send welcome
      mgr.send(playerId, { type: 'connected', payload: { playerId } });

      // Handle pong
      ws.on('message', (raw) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          const text = raw.toString();
          const msg = JSON.parse(text) as { type: string };
          if (msg.type === 'pong') {
            mgr.handlePong(playerId);
          }
        } catch {
          // Ignore malformed messages silently
        }
      });

      ws.on('close', () => {
        mgr.removeConnection(playerId);
      });

      ws.on('error', () => {
        mgr.removeConnection(playerId);
      });
    });
  });

  return wss;
}
