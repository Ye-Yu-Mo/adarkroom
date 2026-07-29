/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-confusing-void-expression */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/non-nullable-type-assertion-style */
/**
 * Multiplayer entry point — wires all client modules together
 * and adds multiplayer UI to the game.
 *
 * Loaded via <script type="module" src="client/main.js"> in index.html.
 */

// Import all modules — esbuild bundles them into a single file
import './bridge';
import { Multiplayer } from './multiplayer';
import { VillageSync } from './village-sync';
import { MultiplayerBridge } from './multiplayer-bridge';

// ── Constants ────────────────────────────────────────────
const API_BASE = 'http://localhost:3400/api/v1';

// ── Auth UI ──────────────────────────────────────────────

function addMultiplayerMenu(): void {
  const tryAdd = () => {
    const volumeBtn = document.querySelector('.menu .volume');
    if (!volumeBtn) { setTimeout(tryAdd, 200); return; }
    if (document.querySelector('#mp-connect-btn')) return;

    const btn = document.createElement('span');
    btn.id = 'mp-connect-btn';
    btn.textContent = 'multiplayer.';
    btn.style.cssText = 'cursor:pointer;';
    btn.onclick = showMultiplayerDialog;
    // Insert after volume button, before appStore
    volumeBtn.parentNode?.insertBefore(btn, volumeBtn.nextSibling);
    // eslint-disable-next-line no-console
    console.log('[adr] multiplayer menu item added');
  };
  tryAdd();
}

function showMultiplayerDialog(): void {
  const existing = document.querySelector('#mp-dialog');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'mp-dialog';
  panel.className = 'eventPanel';
  panel.style.cssText = 'left:200px;top:120px;min-height:auto;';

  if (Multiplayer.isConnected()) {
    showConnectedState(panel);
  } else if (Multiplayer.getToken()) {
    showReconnectingState(panel);
  } else {
    showLoginForm(panel);
  }

  // Click-outside-to-close overlay
  const overlay = document.createElement('div');
  overlay.id = 'mp-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:19;';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

function makeMpButton(text: string): HTMLDivElement {
  const btn = document.createElement('div');
  btn.className = 'button';
  btn.textContent = text;
  btn.style.cssText = 'float:left;margin-right:16px;width:auto;padding:0 12px;';
  return btn;
}

function showLoginForm(panel: HTMLDivElement): void {
  const title = document.createElement('div');
  title.className = 'eventTitle';
  title.textContent = 'Multiplayer';

  const desc = document.createElement('div');
  desc.id = 'description';
  desc.style.minHeight = 'auto';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'enter your name';
  input.maxLength = 24;
  input.style.cssText = 'width:100%;padding:4px;margin:12px 0;background:#fff;color:#111;border:1px solid #888;font-family:inherit;font-size:14px;';

  const status = document.createElement('div');
  status.style.cssText = 'margin:8px 0;font-size:12px;color:#666;';

  const btns = document.createElement('div');
  btns.id = 'buttons';

  const registerBtn = makeMpButton('register.');
  const closeBtn = makeMpButton('close.');

  registerBtn.onclick = async () => {
    const name = input.value.trim();
    if (!name) { status.textContent = 'enter a name.'; return; }
    status.textContent = 'connecting...';
    registerBtn.classList.add('disabled');
    try {
      const deviceId = 'adr-' + Math.random().toString(36).substring(2, 10);
      const res = await fetch(API_BASE + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, display_name: name }),
      });
      const data = await res.json() as { ok: boolean; data?: { token: string }; error?: { message: string } };
      if (data.ok && data.data?.token) {
        Multiplayer.connect(data.data.token);
        status.textContent = 'connected.';
        setTimeout(() => { panel.remove(); document.querySelector('#mp-overlay')?.remove(); }, 600);
      } else {
        status.textContent = data.error?.message ?? 'failed.';
        registerBtn.classList.remove('disabled');
      }
    } catch {
      status.textContent = 'server not reachable.';
      registerBtn.classList.remove('disabled');
    }
  };

  closeBtn.onclick = () => { panel.remove(); document.querySelector('#mp-overlay')?.remove(); };

  btns.appendChild(registerBtn);
  btns.appendChild(closeBtn);

  desc.appendChild(input);
  desc.appendChild(status);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);
  panel.appendChild(document.createElement('div')).className = 'clear';

  setTimeout(() => input.focus(), 100);
}

function showReconnectingState(panel: HTMLDivElement): void {
  const title = document.createElement('div');
  title.className = 'eventTitle';
  title.textContent = 'Multiplayer';

  const desc = document.createElement('div');
  desc.id = 'description';
  desc.style.minHeight = 'auto';
  desc.style.cssText = 'padding:12px 0;';

  const status = document.createElement('div');
  status.textContent = 'reconnecting...';

  const btns = document.createElement('div');
  btns.id = 'buttons';
  const closeBtn = makeMpButton('close.');
  closeBtn.onclick = () => { panel.remove(); document.querySelector('#mp-overlay')?.remove(); };
  btns.appendChild(closeBtn);

  desc.appendChild(status);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);

  Multiplayer.connect(Multiplayer.getToken()!);
  setTimeout(() => {
    if (Multiplayer.isConnected()) {
      status.textContent = 'connected.';
      setTimeout(() => { panel.remove(); document.querySelector('#mp-overlay')?.remove(); }, 500);
    } else {
      status.textContent = 'could not connect.';
    }
  }, 2000);
}

function showConnectedState(panel: HTMLDivElement): void {
  const title = document.createElement('div');
  title.className = 'eventTitle';
  title.textContent = 'Multiplayer';

  const desc = document.createElement('div');
  desc.id = 'description';
  desc.style.minHeight = 'auto';
  desc.style.cssText = 'padding:12px 0;';
  desc.textContent = 'you are connected.';

  const btns = document.createElement('div');
  btns.id = 'buttons';

  const disconnectBtn = makeMpButton('disconnect.');
  const closeBtn = makeMpButton('close.');

  disconnectBtn.onclick = () => {
    Multiplayer.disconnect();
    MultiplayerBridge.deactivate();
    panel.remove();
    document.querySelector('#mp-overlay')?.remove();
  };
  closeBtn.onclick = () => { panel.remove(); document.querySelector('#mp-overlay')?.remove(); };

  btns.appendChild(disconnectBtn);
  btns.appendChild(closeBtn);
  panel.appendChild(title);
  panel.appendChild(desc);
  panel.appendChild(btns);
}

// ── World connection ─────────────────────────────────────

async function connectToWorld(): Promise<void> {
  try {
    // Get world ID
    const token = Multiplayer.getToken();
    if (!token) return;

    void await fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: 'adr-reconnect' }),
    });
    // Get world from health check — just use the guild API to find world
    // For now, use a known approach: fetch guilds list (will be empty if none)
    const worldRes = await fetch('http://localhost:3400/api/health');
    const worldData = await worldRes.json();

    if (worldData.ok) {
      // Activate the multiplayer bridge — this hooks into World module
      // We need the world ID — fetch it from the server
      // For simplicity, we use a hardcoded approach: the server has one default world
      // In a real app, we'd GET /api/v1/worlds
      // For now, just initialize bridge with a placeholder — it'll be replaced when they embark
    }
  } catch {
    // Server not ready — will retry on next interaction
  }
}

// ── Auto-connect on load ─────────────────────────────────

function autoConnect(): void {
  const token = Multiplayer.getToken();
  if (token) {
    Multiplayer.connect(token);
    setTimeout(() => {
      if (Multiplayer.isConnected()) {
        VillageSync.init();
      }
    }, 1000);
  }
}

// ── Init ─────────────────────────────────────────────────

// Wait for the game Engine to initialize, then add our UI
function init(): void {
  addMultiplayerMenu();

  // Try auto-connect if we have a saved token
  if (Multiplayer.getToken()) {
    autoConnect();
  }

  // Listen for connect event to initialize village sync
  Multiplayer.on('connect', () => {
    VillageSync.init();
  });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
