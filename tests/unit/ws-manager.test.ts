/**
 * WebSocket server unit tests — M1-F6
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WsManager } from '../../server/ws/index';

interface SocketLike {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

function fakeSocket(): SocketLike {
  return { send: vi.fn(), close: vi.fn(), readyState: 1 };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('WsManager', () => {
  describe('connection management', () => {
    it('adds and tracks a player connection', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();

      mgr.addConnection('player-1', ws);
      expect(mgr.getOnlineCount()).toBe(1);
      expect(mgr.isOnline('player-1')).toBe(true);
      expect(mgr.isOnline('player-2')).toBe(false);
    });

    it('removes a player connection', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();

      mgr.addConnection('player-1', ws);
      mgr.removeConnection('player-1');
      expect(mgr.getOnlineCount()).toBe(0);
    });

    it('closes old connection on reconnect', () => {
      const mgr = new WsManager();
      const ws1 = fakeSocket();
      const ws2 = fakeSocket();

      mgr.addConnection('p1', ws1);
      mgr.addConnection('p1', ws2);
      expect(ws1.close).toHaveBeenCalled();
      expect(mgr.getOnlineCount()).toBe(1);
    });
  });

  describe('message sending', () => {
    it('sends a message to a specific player', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();

      mgr.addConnection('p1', ws);
      mgr.send('p1', { type: 'test', payload: { msg: 'hello' } });

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]?.[0] as string) as {
        type: string;
        payload: { msg: string };
      };
      expect(sent.type).toBe('test');
      expect(sent.payload.msg).toBe('hello');
    });

    it('silently ignores send to offline player', () => {
      const mgr = new WsManager();
      expect(() => {
        mgr.send('offline', { type: 'test', payload: {} });
      }).not.toThrow();
    });

    it('broadcasts to selected players', () => {
      const mgr = new WsManager();
      const ws1 = fakeSocket();
      const ws2 = fakeSocket();
      const ws3 = fakeSocket();

      mgr.addConnection('a', ws1);
      mgr.addConnection('b', ws2);
      mgr.addConnection('c', ws3);

      mgr.broadcast(['a', 'c'], { type: 'ev', payload: {} });

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).not.toHaveBeenCalled();
      expect(ws3.send).toHaveBeenCalledTimes(1);
    });

    it('skips closed connections', () => {
      const mgr = new WsManager();
      const ws: SocketLike = { send: vi.fn(), close: vi.fn(), readyState: 3 };
      mgr.addConnection('p1', ws);
      mgr.send('p1', { type: 'test', payload: {} });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('message sequencing', () => {
    it('increments sequence number for each message', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();

      mgr.addConnection('p1', ws);
      mgr.send('p1', { type: 'a', payload: {} });
      mgr.send('p1', { type: 'b', payload: {} });
      mgr.send('p1', { type: 'c', payload: {} });

      const calls = ws.send.mock.calls;
      const s1 = (JSON.parse(calls[0]?.[0] as string) as { seq: number }).seq;
      const s2 = (JSON.parse(calls[1]?.[0] as string) as { seq: number }).seq;
      const s3 = (JSON.parse(calls[2]?.[0] as string) as { seq: number }).seq;
      expect(s2).toBe(s1 + 1);
      expect(s3).toBe(s2 + 1);
    });
  });

  describe('heartbeat', () => {
    it('pings all connected players at interval', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();
      mgr.addConnection('p1', ws);

      mgr.startHeartbeat(1000);
      vi.advanceTimersByTime(1000);

      expect(ws.send).toHaveBeenCalled();
      const msg = JSON.parse(ws.send.mock.calls[0]?.[0] as string) as { type: string };
      expect(msg.type).toBe('ping');
      mgr.stopHeartbeat();
    });

    it('kicks players who miss heartbeat', () => {
      const mgr = new WsManager();
      const ws: SocketLike = { send: vi.fn(), close: vi.fn(), readyState: 1 };
      mgr.addConnection('p1', ws);

      mgr.startHeartbeat(5000);
      vi.advanceTimersByTime(5000); // send ping
      vi.advanceTimersByTime(5000); // next cycle timeouts pending pongs

      expect(ws.close).toHaveBeenCalled();
      mgr.stopHeartbeat();
    });

    it('keeps players who respond to pong', () => {
      const mgr = new WsManager();
      const ws = fakeSocket();
      mgr.addConnection('p1', ws);

      mgr.startHeartbeat(5000);
      vi.advanceTimersByTime(5000); // ping sent
      mgr.handlePong('p1');
      vi.advanceTimersByTime(5000); // next heartbeat cycle

      expect(ws.close).not.toHaveBeenCalled();
      mgr.stopHeartbeat();
    });
  });
});
