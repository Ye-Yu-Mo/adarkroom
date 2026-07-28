/**
 * Bridge between old game layer (vanilla JS) and new multiplayer layer (TypeScript).
 *
 * This module is loaded via <script type="module"> in index.html.
 * It creates window.__adr as the single communication channel between layers.
 *
 * Old layer (game scripts) → exposes State on window
 * New layer (multiplayer)   → reads State via __adr.getState()
 * Old layer ($SM)           → calls __adr._notifyStateChange() on state updates
 * New layer                 → subscribes via __adr.onStateChange()
 *
 * @module client/bridge
 */

interface AdrBridge {
  getState(): unknown;
  onStateChange(cb: (category: string, stateName: string) => void): void;
  /** Called by $SM.fireUpdate to notify multiplayer layer of state changes. */
  _notifyStateChange(category: string, stateName: string): void;
}

const listeners: ((category: string, stateName: string) => void)[] = [];

const bridge: AdrBridge = {
  getState(): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).State ?? null;
  },

  onStateChange(cb: (category: string, stateName: string) => void): void {
    listeners.push(cb);
  },

  _notifyStateChange(category: string, stateName: string): void {
    for (const cb of listeners) {
      try {
        cb(category, stateName);
      } catch {
        // Don't let one broken listener break others
      }
    }
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__adr = bridge;

export type { AdrBridge };
