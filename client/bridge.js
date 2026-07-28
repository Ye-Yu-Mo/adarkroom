// client/bridge.ts
var listeners = [];
var bridge = {
  getState() {
    return globalThis.State ?? null;
  },
  onStateChange(cb) {
    listeners.push(cb);
  },
  _notifyStateChange(category, stateName) {
    for (const cb of listeners) {
      try {
        cb(category, stateName);
      } catch {
      }
    }
  }
};
globalThis.__adr = bridge;
