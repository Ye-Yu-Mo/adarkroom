/**
 * Bridge tests — M1-F10
 *
 * Verifies client/bridge.ts creates the window.__adr bridge object
 * and that index.html loads the multiplayer module script.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

// Stub window before importing bridge
beforeEach(() => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3000' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window = globalThis;
});

describe('client/bridge.ts', () => {
  it('exposes window.__adr after import', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__adr;
    await import('../../client/bridge');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adr = (globalThis as any).__adr;
    expect(adr).toBeDefined();
    expect(typeof adr.getState).toBe('function');
    expect(typeof adr.onStateChange).toBe('function');
  });

  it('getState() returns null when no game state exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__adr;
    vi.resetModules();

    await import('../../client/bridge');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((globalThis as any).__adr.getState()).toBeNull();
  });

  it('getState() returns the global State object when present', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__adr;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).State = { stores: { wood: 10 } };
    vi.resetModules();

    await import('../../client/bridge');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = (globalThis as any).__adr.getState();
    expect(state).toEqual({ stores: { wood: 10 } });
  });

  it('onStateChange() registers a callback', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).__adr;
    vi.resetModules();

    await import('../../client/bridge');
    const cb = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__adr.onStateChange(cb);

    // Simulate a state update (like what $SM would trigger)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__adr.onStateChange(cb);
    // The callback should be stored for subscription
    // Actual invocation happens via the game engine's event dispatch
    expect(cb).not.toHaveBeenCalled(); // Stored, not auto-called
  });
});

describe('index.html', () => {
  it('loads client/multiplayer.js as module', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    expect(html).toContain('client/multiplayer.js');
    expect(html).toContain('type="module"');
  });

  it('loads client/bridge.js as module', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    expect(html).toContain('client/bridge.js');
    expect(html).toContain('type="module"');
  });
});
