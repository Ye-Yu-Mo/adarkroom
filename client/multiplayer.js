// client/multiplayer.ts
var STORAGE_KEY = "adr_multiplayer";
var RECONNECT_BASE_MS = 1e3;
var RECONNECT_MAX_MS = 3e4;
var ws = null;
var token = null;
var connected = false;
var reconnectTimer = null;
var reconnectAttempts = 0;
var intentionalClose = false;
var handlers = /* @__PURE__ */ new Map();
var messageQueue = [];
function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return null;
}
function saveAuth(tok) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: tok }));
  } catch {
  }
}
var saved = loadAuth();
if (saved) {
  token = saved.token;
}
function getWsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.hostname}:${location.port || "3000"}/ws`;
}
function createSocket() {
  if (!token) return;
  const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(url);
  ws.onopen = () => {
    connected = true;
    reconnectAttempts = 0;
    emit("connect", {});
    drainQueue();
  };
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "ping") {
        ws?.send(JSON.stringify({ type: "pong" }));
        return;
      }
      dispatch(msg.type, msg.payload);
    } catch {
    }
  };
  ws.onclose = (event) => {
    connected = false;
    if (!intentionalClose) {
      scheduleReconnect();
    }
    emit("disconnect", { code: event.code, reason: event.reason });
  };
  ws.onerror = () => {
  };
}
function drainQueue() {
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    if (msg) sendRaw(msg);
  }
}
function sendRaw(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
function scheduleReconnect() {
  if (reconnectTimer) return;
  if (!token) return;
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS
  );
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createSocket();
  }, delay);
}
function dispatch(type, payload) {
  const subs = handlers.get(type);
  if (subs) {
    for (const fn of subs) {
      try {
        fn(payload);
      } catch {
      }
    }
  }
}
function emit(type, payload) {
  dispatch(type, payload);
}
var Multiplayer = {
  /** Connect (or reconnect) with a JWT token. Call once on login. */
  connect(newToken) {
    intentionalClose = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    token = newToken;
    saveAuth(newToken);
    if (ws) {
      intentionalClose = true;
      ws.close();
      intentionalClose = false;
    }
    createSocket();
  },
  /** Graceful disconnect — no auto-reconnect. */
  disconnect() {
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
  send(type, payload) {
    const msg = { type, payload };
    if (connected && ws?.readyState === WebSocket.OPEN) {
      sendRaw(msg);
    } else {
      messageQueue.push(msg);
    }
  },
  /** Subscribe to messages of a given type. Returns unsubscribe function. */
  on(type, fn) {
    let subs = handlers.get(type);
    if (!subs) {
      subs = /* @__PURE__ */ new Set();
      handlers.set(type, subs);
    }
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
  /** Check connection status. */
  isConnected() {
    return connected;
  },
  /** Get the stored auth token (or null). */
  getToken() {
    return token;
  },
  /** HTTP API client — uses the stored token for Authorization. */
  api: {
    async get(path) {
      const res = await fetch(path, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return res.json();
    },
    async post(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...token ? { Authorization: `Bearer ${token}` } : {}
        },
        body: JSON.stringify(body)
      });
      return res.json();
    }
  }
};
export {
  Multiplayer
};
