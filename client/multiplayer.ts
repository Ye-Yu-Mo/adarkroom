/**
 * Client-side multiplayer connection manager.
 *
 * Singleton that handles WebSocket connection, auto-reconnect,
 * heartbeat, message queue, HTTP API calls, and auth persistence.
 *
 *   import { Multiplayer } from './multiplayer';
 *
 *   Multiplayer.connect(token);
 *   Multiplayer.send('player:move', { x: 10, y: 20 });
 *   Multiplayer.on('guild:resource_update', (payload) => { ... });
 *
 * @module client/multiplayer
 */

// ── Types ────────────────────────────────────────────────

type MessageHandler = (payload: unknown) => void;
type Unsubscribe = () => void;

interface StoredAuth {
  token: string;
}

interface WSMsg {
  type: string;
  seq?: number;
  ts?: number;
  payload?: unknown;
}

// ── State ────────────────────────────────────────────────

const STORAGE_KEY = 'adr_multiplayer';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

let ws: WebSocket | null = null;
let token: string | null = null;
let connected = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let intentionalClose = false;

const handlers = new Map<string, Set<MessageHandler>>();
const messageQueue: WSMsg[] = [];

// ── Auth persistence ─────────────────────────────────────

function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredAuth;
  } catch {
    // Corrupted — clear it
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}

function saveAuth(tok: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: tok }));
  } catch {
    // Storage full or unavailable — non-critical
  }
}

// Attempt auto-load from storage on module import
const saved = loadAuth();
if (saved) {
  token = saved.token;
}

// ── WebSocket connection ─────────────────────────────────

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.hostname}:${location.port || '3000'}/ws`;
}

function createSocket(): void {
  if (!token) return;

  const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    connected = true;
    reconnectAttempts = 0;
    emit('connect', {});
    drainQueue();
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data as string) as WSMsg;
      if (msg.type === 'ping') {
        // Auto-reply pong
        ws?.send(JSON.stringify({ type: 'pong' }));
        return;
      }
      dispatch(msg.type, msg.payload);
    } catch {
      // Ignore malformed messages
    }
  };

  ws.onclose = (event: CloseEvent) => {
    connected = false;
    if (!intentionalClose) {
      scheduleReconnect();
    }
    emit('disconnect', { code: event.code, reason: event.reason });
  };

  ws.onerror = () => {
    // onclose will fire after this — reconnect handled there
  };
}

function drainQueue(): void {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    if (msg) sendRaw(msg);
  }
}

function sendRaw(msg: WSMsg): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  if (!token) return;

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS,
  );
  reconnectAttempts++;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createSocket();
  }, delay);
}

// ── Event dispatch ───────────────────────────────────────

function dispatch(type: string, payload: unknown): void {
  const subs = handlers.get(type);
  if (subs) {
    for (const fn of subs) {
      try {
        fn(payload);
      } catch {
        // Don't let one broken handler break others
      }
    }
  }
}

function emit(type: string, payload: unknown): void {
  dispatch(type, payload);
}

// ── Public API ───────────────────────────────────────────

export const Multiplayer = {
  /** Connect (or reconnect) with a JWT token. Call once on login. */
  connect(newToken: string): void {
    intentionalClose = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    token = newToken;
    saveAuth(newToken);

    // Close existing connection if any
    if (ws) {
      intentionalClose = true;
      ws.close();
      intentionalClose = false;
    }

    createSocket();
  },

  /** Graceful disconnect — no auto-reconnect. */
  disconnect(): void {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    connected = false;
  },

  /** Send a message to the server. Queues if disconnected. */
  send(type: string, payload?: unknown): void {
    const msg: WSMsg = { type, payload };
    if (connected && ws?.readyState === WebSocket.OPEN) {
      sendRaw(msg);
    } else {
      messageQueue.push(msg);
    }
  },

  /** Subscribe to messages of a given type. Returns unsubscribe function. */
  on(type: string, fn: MessageHandler): Unsubscribe {
    let subs = handlers.get(type);
    if (!subs) {
      subs = new Set();
      handlers.set(type, subs);
    }
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },

  /** Check connection status. */
  isConnected(): boolean {
    return connected;
  },

  /** Get the stored auth token (or null). */
  getToken(): string | null {
    return token;
  },

  /** HTTP API client — uses the stored token for Authorization. */
  api: {
    async get(path: string): Promise<unknown> {
      const res = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return res.json();
    },

    async post(path: string, body: unknown): Promise<unknown> {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      return res.json();
    },
  },
};
