/**
 * Client multiplayer connection manager tests — M1-F7
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────

const mockWsInstances: MockWebSocket[] = [];
let wsConnectDelay = 0;

class MockWebSocket {
  url: string;
  readyState: number;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  static OPEN = 1;

  constructor(url: string) {
    this.url = url;
    this.readyState = 0;
    mockWsInstances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, wsConnectDelay);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }

  receiveMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

const mockFetch = vi.fn();
const storage = new Map<string, string>();

function setStorage(key: string, value: string) {
  storage.set(key, value);
}

function getStorage(key: string): string | null {
  return storage.get(key) ?? null;
}

function setupGlobals() {
  mockWsInstances.length = 0;
  wsConnectDelay = 0;
  mockFetch.mockReset();
  storage.clear();

  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => getStorage(k),
    setItem: (k: string, v: string) => { storage.set(k, v); },
    removeItem: (k: string) => { storage.delete(k); },
  });
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3000' });
}

beforeEach(() => {
  vi.useFakeTimers();
  setupGlobals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Helpers ──────────────────────────────────────────────

function lastWs(): MockWebSocket {
  const ws = mockWsInstances[mockWsInstances.length - 1];
  if (!ws) throw new Error('No WebSocket instance');
  return ws;
}

function parseSent(ws: MockWebSocket, index: number): Record<string, unknown> {
  const raw = ws.sent[index];
  if (!raw) throw new Error(`No sent message at index ${index}`);
  return JSON.parse(raw) as Record<string, unknown>;
}

function lastSent(ws: MockWebSocket): Record<string, unknown> {
  const raw = ws.sent[ws.sent.length - 1];
  if (!raw) throw new Error('No sent messages');
  return JSON.parse(raw) as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════

describe('Multiplayer', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Multiplayer: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../client/multiplayer');
    Multiplayer = mod.Multiplayer;
  });

  describe('connect', () => {
    it('establishes WebSocket with token in URL query', async () => {
      Multiplayer.connect('test-token-123');
      await vi.runAllTimersAsync();

      expect(mockWsInstances.length).toBe(1);
      const ws = lastWs();
      expect(ws.url).toContain('/ws?token=test-token-123');
      expect(ws.readyState).toBe(1);
    });

    it('sets connected state to true after open', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();
      expect(Multiplayer.isConnected()).toBe(true);
    });

    it('fires connect event', async () => {
      const cb = vi.fn();
      Multiplayer.on('connect', cb);
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('send', () => {
    it('sends JSON-formatted message over WebSocket', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      Multiplayer.send('player:move', { x: 10, y: 20 });

      const msg = lastSent(lastWs());
      expect(msg.type).toBe('player:move');
      expect((msg.payload as { x: number; y: number }).x).toBe(10);
    });

    it('queues messages when disconnected and sends on reconnect', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      lastWs().close();
      expect(Multiplayer.isConnected()).toBe(false);

      Multiplayer.send('queued:msg', { id: 1 });
      Multiplayer.send('queued:msg', { id: 2 });

      wsConnectDelay = 1;
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      const ws2 = lastWs();
      expect(ws2.sent.length).toBe(2);
      expect(parseSent(ws2, 0).type).toBe('queued:msg');
      expect(parseSent(ws2, 1).type).toBe('queued:msg');
    });
  });

  describe('on / message dispatch', () => {
    it('dispatches received messages to registered handlers', async () => {
      const handler = vi.fn();
      Multiplayer.on('world:tile_update', handler);

      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      lastWs().receiveMessage({ type: 'world:tile_update', seq: 1, ts: 0, payload: { tile: 'A' } });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ tile: 'A' });
    });

    it('removes handler via returned unsubscribe', async () => {
      const handler = vi.fn();
      const unsub = Multiplayer.on('test', handler);
      unsub();

      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      lastWs().receiveMessage({ type: 'test', seq: 1, ts: 0, payload: {} });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('responds with pong when ping is received', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();

      lastWs().receiveMessage({ type: 'ping', seq: 5, ts: 0 });

      expect(lastSent(lastWs()).type).toBe('pong');
    });
  });

  describe('auto-reconnect', () => {
    it('attempts reconnection with exponential backoff', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();
      lastWs().close();

      vi.advanceTimersByTime(1100);
      expect(mockWsInstances.length).toBe(2);

      mockWsInstances[1]?.close();
      vi.advanceTimersByTime(2100);
      expect(mockWsInstances.length).toBe(3);
    });

    it('stops reconnecting after disconnect() call', async () => {
      Multiplayer.connect('tok');
      await vi.runAllTimersAsync();
      lastWs().close();
      Multiplayer.disconnect();

      vi.advanceTimersByTime(5000);
      expect(mockWsInstances.length).toBe(1);
    });
  });

  describe('auth persistence', () => {
    it('stores token to localStorage on connect', async () => {
      Multiplayer.connect('persist-token');
      await vi.runAllTimersAsync();

      const raw = getStorage('adr_multiplayer');
      expect(raw).toBeTruthy();
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string };
        expect(parsed.token).toBe('persist-token');
      }
    });

    it('loads token from localStorage on init', async () => {
      setStorage('adr_multiplayer', JSON.stringify({ token: 'saved-token' }));
      vi.resetModules();
      const mod = await import('../../client/multiplayer');
      expect(mod.Multiplayer.getToken()).toBe('saved-token');
    });
  });

  describe('HTTP API client', () => {
    it('sends GET with Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: () => Promise.resolve({ ok: true, data: { test: 1 } }),
      });

      Multiplayer.connect('api-token');
      await vi.runAllTimersAsync();

      const result = await Multiplayer.api.get('/api/v1/test');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(callArgs[1].headers.Authorization).toBe('Bearer api-token');
      expect((result as { data: { test: number } }).data.test).toBe(1);
    });

    it('sends POST with JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 201,
        json: () => Promise.resolve({ ok: true, data: {} }),
      });

      Multiplayer.connect('api-token');
      await vi.runAllTimersAsync();

      await Multiplayer.api.post('/api/v1/auth/register', {
        device_id: 'dev1',
        display_name: 'Test',
      });

      const callArgs = mockFetch.mock.calls[0] as [
        string,
        { method: string; body: string; headers: Record<string, string> },
      ];
      expect(callArgs[1].method).toBe('POST');
      expect(callArgs[1].headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(callArgs[1].body)).toEqual({
        device_id: 'dev1',
        display_name: 'Test',
      });
    });
  });
});
