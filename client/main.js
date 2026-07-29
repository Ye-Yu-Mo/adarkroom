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
  const port = "3400";
  return `${proto}//${location.hostname}:${port}/ws`;
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
if (typeof window !== "undefined") {
  window.Multiplayer = Multiplayer;
}

// client/guild.ts
var guildId = null;
var guildName = "";
var inviteCode = "";
var members = [];
var buildings = [];
var resources = [];
var workers = [];
function apiBase() {
  if (typeof location !== "undefined") return `${location.protocol}//${location.hostname}:${location.port || "3000"}`;
  return "http://localhost:3400";
}
async function apiGet(path) {
  const token2 = getToken();
  const res = await fetch(`${apiBase()}${path}`, { headers: token2 ? { Authorization: `Bearer ${token2}` } : {} });
  return res.json().then((d) => d.data);
}
async function apiPost(path, body) {
  const token2 = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...token2 ? { Authorization: `Bearer ${token2}` } : {} },
    body: JSON.stringify(body)
  });
  return res.json().then((d) => d.data);
}
function getToken() {
  return window.Multiplayer?.getToken?.() ?? null;
}
var GuildState = {
  isJoined: () => guildId !== null,
  getGuildId: () => guildId,
  getInviteCode: () => inviteCode,
  setGuild(id, name, code) {
    guildId = id;
    guildName = name;
    inviteCode = code;
  },
  // ── Members ────────────────────────────────────────────
  getMembers: () => members,
  setMembers(list) {
    members.length = 0;
    members.push(...list);
  },
  updateMemberOnline(id, online) {
    const m = members.find((x) => x.player_id === id);
    if (m) m.online = online;
  },
  // ── Buildings ──────────────────────────────────────────
  getBuildingLevel(name) {
    return buildings.find((b) => b.building_name === name)?.level ?? 0;
  },
  setBuildings(list) {
    buildings.length = 0;
    buildings.push(...list);
  },
  // ── Resources ──────────────────────────────────────────
  getResource(name) {
    return resources.find((r) => r.resource_name === name) ?? null;
  },
  setResources(list) {
    resources.length = 0;
    resources.push(...list);
  },
  // ── Workers ────────────────────────────────────────────
  getWorkerCount(type) {
    return workers.find((w) => w.worker_type === type)?.count ?? 0;
  },
  setWorkers(list) {
    workers.length = 0;
    workers.push(...list);
  },
  // ── Leave ──────────────────────────────────────────────
  leave() {
    guildId = null;
    members.length = 0;
    buildings.length = 0;
    resources.length = 0;
    workers.length = 0;
  },
  // ── API actions ────────────────────────────────────────
  async fetchDetails() {
    if (!guildId) return;
    const data = await apiGet(`/api/v1/guilds/${guildId}`);
    if (data.members) this.setMembers(data.members);
    if (data.buildings) this.setBuildings(data.buildings);
    if (data.resources) this.setResources(data.resources);
    if (data.workers) this.setWorkers(data.workers);
    this.render();
  },
  async createGuild(name) {
    const data = await apiPost("/api/v1/guilds", { name });
    if (data.id && data.invite_code) {
      this.setGuild(data.id, name, data.invite_code);
      return data.invite_code;
    }
    return null;
  },
  async joinGuild(gid, code) {
    const data = await apiPost(`/api/v1/guilds/${gid}/join`, { invite_code: code });
    if (data.guild_id) {
      await this.fetchDetails();
      return true;
    }
    return false;
  },
  async build(buildingName) {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/build`, { building_name: buildingName });
    if (data.building) {
      await this.fetchDetails();
      return true;
    }
    return false;
  },
  async assignWorkers(workerType, count) {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/workers`, { worker_type: workerType, count });
    return !!data.worker_type;
  },
  async withdraw(resourceName, amount) {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/resources/withdraw`, { resource_name: resourceName, amount });
    if (data.resource_name) {
      await this.fetchDetails();
      return true;
    }
    return false;
  },
  // ── Render ─────────────────────────────────────────────
  render() {
    if (typeof document === "undefined") return;
    let panel = document.querySelector("#guild-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "guild-panel";
      panel.className = "guild-panel";
      const target = document.querySelector("#outsidePanel") ?? document.querySelector("#roomPanel");
      if (target) target.appendChild(panel);
    }
    if (!guildId) {
      panel.innerHTML = '<div class="guild-empty">Not in a guild</div>';
      return;
    }
    const memberHtml = members.map((m) => {
      const dot = m.online ? '<span class="online-dot">\u25CF</span>' : '<span class="offline-dot">\u25CB</span>';
      return `<div class="guild-member">${dot} ${m.display_name} <span class="role">${m.role}</span></div>`;
    }).join("");
    const buildingHtml = buildings.map((b) => `<div>${b.building_name} (Lv.${b.level})</div>`).join("");
    const resourceHtml = resources.map((r) => `<div>${r.resource_name}: ${Math.floor(r.quantity)}</div>`).join("");
    const workerHtml = workers.map((w) => `<div>${w.worker_type}: ${w.count}</div>`).join("");
    panel.innerHTML = `
      <div class="guild-header">${guildName} <span class="invite-code">[${inviteCode}]</span></div>
      <div class="guild-section"><b>Members</b>${memberHtml}</div>
      <div class="guild-section"><b>Buildings</b>${buildingHtml || "<div>(none)</div>"}</div>
      <div class="guild-section"><b>Resources</b>${resourceHtml || "<div>(none)</div>"}</div>
      <div class="guild-section"><b>Workers</b>${workerHtml || "<div>(none)</div>"}</div>
    `;
  }
};

// client/village-sync.ts
var initialized = false;
var VillageSync = {
  init() {
    if (initialized) return;
    initialized = true;
    const mp = window.Multiplayer;
    if (!mp) return;
    mp.on("guild:resource_update", (_payload) => {
      GuildState.fetchDetails().catch(() => void 0);
    });
    mp.on("guild:building_complete", (_payload) => {
      GuildState.fetchDetails().catch(() => void 0);
    });
    mp.on("guild:member_online", (payload) => {
      GuildState.updateMemberOnline(payload.playerId, payload.online);
      GuildState.render();
    });
  }
};

// client/world-sync.ts
var STORAGE_PREFIX = "adr_world_cache_";
var cache = /* @__PURE__ */ new Map();
var worldId = "";
var authToken = "";
var viewportHash = null;
var viewportCenter = { x: 0, y: 0 };
var viewportRadius = 0;
function apiBase2() {
  if (typeof location !== "undefined") {
    return `${location.protocol}//${location.hostname}:${location.port || "3000"}`;
  }
  return "http://localhost:3400";
}
var WorldSync = {
  key(x, y) {
    return `${x},${y}`;
  },
  init(wid, token2) {
    worldId = wid;
    authToken = token2;
    cache = /* @__PURE__ */ new Map();
    viewportHash = null;
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${wid}`);
      if (raw) {
        const saved2 = JSON.parse(raw);
        cache = new Map(Object.entries(saved2));
      }
    } catch {
    }
    this.subscribeWs();
  },
  subscribeWs() {
    const mp = window.Multiplayer;
    if (!mp) return;
    mp.on("player:enter", (p) => {
      this.onPlayerEnter(p.playerId, p.displayName, p.pos.x, p.pos.y);
    });
    mp.on("player:leave", (p) => {
      this.onPlayerLeave(p.playerId);
    });
    mp.on("player:move", (p) => {
      this.onPlayerMove(p.playerId, p.x, p.y);
    });
  },
  onPlayerEnter(id, name, x, y) {
    if (typeof window !== "undefined") {
      window.Minimap?.updatePlayer(id, name, x, y);
    }
  },
  onPlayerLeave(id) {
    window.Minimap?.removePlayer(id);
  },
  onPlayerMove(id, x, y) {
    window.Minimap?.updatePlayer(id, "", x, y);
  },
  getTile(x, y) {
    return cache.get(this.key(x, y)) ?? null;
  },
  mergeTiles(tiles) {
    for (const t of tiles) {
      const existing = cache.get(this.key(t.x, t.y));
      cache.set(this.key(t.x, t.y), {
        tile_type: t.tile_type,
        explored: t.explored ?? existing?.explored ?? false
      });
    }
    this.saveCache();
  },
  /** Call when player moves. Fetches new tiles from server if viewport changed. */
  async updateViewport(cx, cy, radius) {
    if (cx === viewportCenter.x && cy === viewportCenter.y && radius === viewportRadius) {
      return;
    }
    viewportCenter = { x: cx, y: cy };
    viewportRadius = radius;
    const x1 = Math.max(0, cx - radius);
    const y1 = Math.max(0, cy - radius);
    const x2 = Math.min(60, cx + radius);
    const y2 = Math.min(60, cy + radius);
    const url = new URL(`${apiBase2()}/api/v1/world/${worldId}/tiles`);
    url.searchParams.set("x1", String(x1));
    url.searchParams.set("y1", String(y1));
    url.searchParams.set("x2", String(x2));
    url.searchParams.set("y2", String(y2));
    if (viewportHash) {
      url.searchParams.set("hash", viewportHash);
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const body = await res.json();
    if (body.ok && body.data.tiles.length > 0) {
      this.mergeTiles(body.data.tiles);
    }
    viewportHash = body.data.hash;
  },
  getViewportHash() {
    const tiles = [];
    for (let dy = -viewportRadius; dy <= viewportRadius; dy++) {
      for (let dx = -viewportRadius; dx <= viewportRadius; dx++) {
        const t = this.getTile(viewportCenter.x + dx, viewportCenter.y + dy);
        if (t) {
          tiles.push({ x: viewportCenter.x + dx, y: viewportCenter.y + dy, ...t });
        }
      }
    }
    const input = tiles.sort((a, b) => a.x - b.x || a.y - b.y).map((t) => `${t.x},${t.y}:${t.tile_type}:${t.explored ? "1" : "0"}`).join("|");
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = (h << 5) - h + input.charCodeAt(i) | 0;
    }
    return String(h >>> 0);
  },
  saveCache() {
    try {
      const obj = {};
      for (const [k, v] of cache) {
        obj[k] = v;
      }
      localStorage.setItem(`${STORAGE_PREFIX}${worldId}`, JSON.stringify(obj));
    } catch {
    }
  },
  reset() {
    cache = /* @__PURE__ */ new Map();
    viewportHash = null;
    viewportCenter = { x: 0, y: 0 };
    viewportRadius = 0;
  }
};

// client/multiplayer-bridge.ts
var LANDMARK_TILES = /* @__PURE__ */ new Set([
  "I",
  "C",
  "S",
  "H",
  "V",
  "O",
  "Y",
  "P",
  "W",
  "B",
  "F",
  "M",
  "U",
  "X",
  "A"
]);
var active = false;
var originals = {};
var bridgeWorldId = "";
var bridgeToken = "";
function apiBase3() {
  if (typeof location !== "undefined") {
    return `${location.protocol}//${location.hostname}:${location.port || "3000"}`;
  }
  return "http://localhost:3400";
}
function getWorld() {
  return globalThis.World;
}
var MultiplayerBridge = {
  isActive() {
    return active;
  },
  hasOriginal(name) {
    return name in originals;
  },
  isLandmark(tile) {
    return LANDMARK_TILES.has(tile);
  },
  activate(worldId2, token2) {
    if (active) return;
    const W = getWorld();
    if (!W) return;
    bridgeWorldId = worldId2;
    bridgeToken = token2;
    active = true;
    originals.generateMap = W.generateMap;
    originals.lightMap = W.lightMap;
    originals.doSpace = W.doSpace;
    WorldSync.init(worldId2, token2);
    W.generateMap = function() {
      W.state ??= {};
      WorldSync.updateViewport(W.curPos[0], W.curPos[1], W.LIGHT_RADIUS ?? 2).then(() => {
        W.state.map = buildStateMap(W.RADIUS ?? 30);
        W.state.mask = buildStateMask(W.RADIUS ?? 30);
      }).catch(() => void 0);
    };
    W.lightMap = function(x, y, mask) {
      WorldSync.updateViewport(x, y, W.LIGHT_RADIUS ?? 2).catch(() => void 0);
      if (Array.isArray(mask)) {
        for (const tile of getAllCachedTiles()) {
          const row = mask[tile.x];
          if (row) row[tile.y] = true;
        }
      }
      return mask;
    };
    W.doSpace = async function() {
      const curTile = W.state?.map?.[W.curPos[0]]?.[W.curPos[1]];
      if (!curTile) return;
      if (MultiplayerBridge.isLandmark(String(curTile)) && curTile !== "A") {
        try {
          const res = await fetch(`${apiBase3()}/api/v1/world/${bridgeWorldId}/landmarks`, {
            headers: { Authorization: `Bearer ${bridgeToken}` }
          });
          const body = await res.json();
          if (body.ok) {
            const lm = body.data.landmarks.find(
              (l) => l.x === W.curPos[0] && l.y === W.curPos[1]
            );
            if (lm?.explored) {
              console.log("[bridge] landmark already explored by another player");
              return;
            }
          }
        } catch {
        }
      }
      if (originals.doSpace) {
        originals.doSpace.call(W);
      }
    };
    hookRoom();
    hookOutside();
  },
  deactivate() {
    if (!active) return;
    const W = getWorld();
    if (W) {
      if (originals.generateMap) W.generateMap = originals.generateMap;
      if (originals.lightMap) W.lightMap = originals.lightMap;
      if (originals.doSpace) W.doSpace = originals.doSpace;
    }
    const R = getRoom();
    if (R && originals.roomBuild) R.build = originals.roomBuild;
    const O = getOutside();
    if (O) {
      if (originals.outsideUpdateIncome) O.updateVillageIncome = originals.outsideUpdateIncome;
      if (originals.outsideIncreasePop) O.increasePopulation = originals.outsideIncreasePop;
      if (originals.outsideGetMaxPop) O.getMaxPopulation = originals.outsideGetMaxPop;
    }
    active = false;
  }
};
function getRoom() {
  return globalThis.Room;
}
function getOutside() {
  return globalThis.Outside;
}
function hookRoom() {
  const R = getRoom();
  if (!R) return;
  originals.roomBuild = R.build;
  R.build = function(btn) {
    if (GuildState.isJoined()) {
      const thing = btn.getAttribute("buildThing");
      if (thing) {
        GuildState.build(thing).then((ok) => {
          if (ok && R.updateBuildButtons) R.updateBuildButtons();
        }).catch(() => void 0);
      }
      return true;
    }
    return originals.roomBuild.call(R, btn);
  };
}
function hookOutside() {
  const O = getOutside();
  if (!O) return;
  originals.outsideUpdateIncome = O.updateVillageIncome;
  originals.outsideIncreasePop = O.increasePopulation;
  originals.outsideGetMaxPop = O.getMaxPopulation;
  O.updateVillageIncome = function() {
    if (GuildState.isJoined()) {
      return;
    }
    originals.outsideUpdateIncome.call(O);
    return;
  };
  O.getMaxPopulation = function() {
    if (GuildState.isJoined()) {
      return GuildState.getBuildingLevel("hut") * 4;
    }
    return originals.outsideGetMaxPop.call(O);
  };
  O.increasePopulation = function() {
    if (GuildState.isJoined()) return;
    originals.outsideIncreasePop.call(O);
    return;
  };
}
function buildStateMap(radius) {
  const size = radius * 2 + 1;
  const map = [];
  for (let y = 0; y < size; y++) {
    map[y] = [];
    for (let x = 0; x < size; x++) {
      const tile = WorldSync.getTile(x, y);
      const row = map[y];
      if (row) row[x] = tile?.tile_type ?? " ";
    }
  }
  return map;
}
function buildStateMask(radius) {
  const size = radius * 2 + 1;
  const mask = [];
  for (let y = 0; y < size; y++) {
    mask[y] = [];
    for (let x = 0; x < size; x++) {
      const row = mask[y];
      if (row) row[x] = WorldSync.getTile(x, y) !== null;
    }
  }
  return mask;
}
function getAllCachedTiles() {
  const tiles = [];
  for (let x = 0; x <= 60; x++) {
    for (let y = 0; y <= 60; y++) {
      if (WorldSync.getTile(x, y)) tiles.push({ x, y });
    }
  }
  return tiles;
}

// client/main.ts
var API_BASE = "http://localhost:3400/api/v1";
function addMultiplayerMenu() {
  const tryAdd = () => {
    const volumeBtn = document.querySelector(".menu .volume");
    if (!volumeBtn) {
      setTimeout(tryAdd, 200);
      return;
    }
    if (document.querySelector("#mp-connect-btn")) return;
    const btn = document.createElement("span");
    btn.id = "mp-connect-btn";
    btn.textContent = "multiplayer.";
    btn.style.cssText = "cursor:pointer;";
    btn.onclick = showMultiplayerDialog;
    volumeBtn.parentNode?.insertBefore(btn, volumeBtn.nextSibling);
    console.log("[adr] multiplayer menu item added");
  };
  tryAdd();
}
function showMultiplayerDialog() {
  const existing = document.querySelector("#mp-dialog");
  if (existing) {
    existing.remove();
    return;
  }
  const panel = document.createElement("div");
  panel.id = "mp-dialog";
  panel.className = "eventPanel";
  panel.style.cssText = "left:200px;top:120px;min-height:auto;";
  if (Multiplayer.isConnected()) {
    showConnectedState(panel);
  } else if (Multiplayer.getToken()) {
    showReconnectingState(panel);
  } else {
    showLoginForm(panel);
  }
  const overlay = document.createElement("div");
  overlay.id = "mp-overlay";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:19;";
  overlay.onclick = () => {
    panel.remove();
    overlay.remove();
  };
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}
function makeMpButton(text) {
  const btn = document.createElement("div");
  btn.className = "button";
  btn.textContent = text;
  btn.style.cssText = "float:left;margin-right:16px;width:auto;padding:0 12px;";
  return btn;
}
function showLoginForm(panel) {
  const title = document.createElement("div");
  title.className = "eventTitle";
  title.textContent = "Multiplayer";
  const desc = document.createElement("div");
  desc.id = "description";
  desc.style.minHeight = "auto";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "enter your name";
  input.maxLength = 24;
  input.style.cssText = "width:100%;padding:4px;margin:12px 0;background:#fff;color:#111;border:1px solid #888;font-family:inherit;font-size:14px;";
  const status = document.createElement("div");
  status.style.cssText = "margin:8px 0;font-size:12px;color:#666;";
  const btns = document.createElement("div");
  btns.id = "buttons";
  const registerBtn = makeMpButton("register.");
  const closeBtn = makeMpButton("close.");
  registerBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) {
      status.textContent = "enter a name.";
      return;
    }
    status.textContent = "connecting...";
    registerBtn.classList.add("disabled");
    try {
      const deviceId = "adr-" + Math.random().toString(36).substring(2, 10);
      const res = await fetch(API_BASE + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_id: deviceId, display_name: name })
      });
      const data = await res.json();
      if (data.ok && data.data?.token) {
        Multiplayer.connect(data.data.token);
        status.textContent = "connected.";
        setTimeout(() => {
          panel.remove();
          document.querySelector("#mp-overlay")?.remove();
        }, 600);
      } else {
        status.textContent = data.error?.message ?? "failed.";
        registerBtn.classList.remove("disabled");
      }
    } catch {
      status.textContent = "server not reachable.";
      registerBtn.classList.remove("disabled");
    }
  };
  closeBtn.onclick = () => {
    panel.remove();
    document.querySelector("#mp-overlay")?.remove();
  };
  btns.appendChild(registerBtn);
  btns.appendChild(closeBtn);
  desc.appendChild(input);
  desc.appendChild(status);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);
  panel.appendChild(document.createElement("div")).className = "clear";
  setTimeout(() => input.focus(), 100);
}
function showReconnectingState(panel) {
  const title = document.createElement("div");
  title.className = "eventTitle";
  title.textContent = "Multiplayer";
  const desc = document.createElement("div");
  desc.id = "description";
  desc.style.minHeight = "auto";
  desc.style.cssText = "padding:12px 0;";
  const status = document.createElement("div");
  status.textContent = "reconnecting...";
  const btns = document.createElement("div");
  btns.id = "buttons";
  const closeBtn = makeMpButton("close.");
  closeBtn.onclick = () => {
    panel.remove();
    document.querySelector("#mp-overlay")?.remove();
  };
  btns.appendChild(closeBtn);
  desc.appendChild(status);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);
  Multiplayer.connect(Multiplayer.getToken());
  setTimeout(() => {
    if (Multiplayer.isConnected()) {
      status.textContent = "connected.";
      setTimeout(() => {
        panel.remove();
        document.querySelector("#mp-overlay")?.remove();
      }, 500);
    } else {
      status.textContent = "could not connect.";
    }
  }, 2e3);
}
function showConnectedState(panel) {
  const title = document.createElement("div");
  title.className = "eventTitle";
  title.textContent = "Multiplayer";
  const desc = document.createElement("div");
  desc.id = "description";
  desc.style.minHeight = "auto";
  desc.style.cssText = "padding:12px 0;";
  desc.textContent = "you are connected.";
  const btns = document.createElement("div");
  btns.id = "buttons";
  const disconnectBtn = makeMpButton("disconnect.");
  const closeBtn = makeMpButton("close.");
  disconnectBtn.onclick = () => {
    Multiplayer.disconnect();
    MultiplayerBridge.deactivate();
    panel.remove();
    document.querySelector("#mp-overlay")?.remove();
  };
  closeBtn.onclick = () => {
    panel.remove();
    document.querySelector("#mp-overlay")?.remove();
  };
  btns.appendChild(disconnectBtn);
  btns.appendChild(closeBtn);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);
}
function autoConnect() {
  const token2 = Multiplayer.getToken();
  if (token2) {
    Multiplayer.connect(token2);
    setTimeout(() => {
      if (Multiplayer.isConnected()) {
        VillageSync.init();
      }
    }, 1e3);
  }
}
function init() {
  addMultiplayerMenu();
  if (Multiplayer.getToken()) {
    autoConnect();
  }
  Multiplayer.on("connect", () => {
    VillageSync.init();
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
