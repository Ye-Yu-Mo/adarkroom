/**
 * Guild (village) client module — data model + UI panel.
 *
 *   import { GuildState } from './guild';
 *   GuildState.setGuild(id, name, code);
 *   GuildState.renderPanel('#outsidePanel');
 */

interface Member {
  player_id: string; display_name: string; role: string; online?: boolean;
}
interface Building {
  building_name: string; level: number;
}
interface Resource {
  resource_name: string; quantity: number; daily_limit: number;
}
interface Worker {
  worker_type: string; count: number;
}

let guildId: string | null = null;
let guildName = '';
let inviteCode = '';
const members: Member[] = [];
const buildings: Building[] = [];
const resources: Resource[] = [];
const workers: Worker[] = [];

function apiBase(): string {
  if (typeof location !== 'undefined') return `${location.protocol}//${location.hostname}:${location.port || '3000'}`;
  return 'http://localhost:3400';
}

async function apiGet(path: string): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return (res.json() as Promise<{ ok: boolean; data: unknown }>).then(d => d.data);
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const token = getToken();
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return (res.json() as Promise<{ ok: boolean; data: unknown }>).then(d => d.data);
}

function getToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).Multiplayer?.getToken?.() ?? null;
}

export const GuildState = {
  isJoined: () => guildId !== null,
  getGuildId: () => guildId,
  getInviteCode: () => inviteCode,

  setGuild(id: string, name: string, code: string): void {
    guildId = id; guildName = name; inviteCode = code;
  },

  // ── Members ────────────────────────────────────────────
  getMembers: () => members,
  setMembers(list: Member[]): void { members.length = 0; members.push(...list); },
  updateMemberOnline(id: string, online: boolean): void {
    const m = members.find(x => x.player_id === id);
    if (m) m.online = online;
  },

  // ── Buildings ──────────────────────────────────────────
  getBuildingLevel(name: string): number {
    return buildings.find(b => b.building_name === name)?.level ?? 0;
  },
  setBuildings(list: Building[]): void { buildings.length = 0; buildings.push(...list); },

  // ── Resources ──────────────────────────────────────────
  getResource(name: string): Resource | null { return resources.find(r => r.resource_name === name) ?? null; },
  setResources(list: Resource[]): void { resources.length = 0; resources.push(...list); },

  // ── Workers ────────────────────────────────────────────
  getWorkerCount(type: string): number { return workers.find(w => w.worker_type === type)?.count ?? 0; },
  setWorkers(list: Worker[]): void { workers.length = 0; workers.push(...list); },

  // ── Leave ──────────────────────────────────────────────
  leave(): void { guildId = null; members.length = 0; buildings.length = 0; resources.length = 0; workers.length = 0; },

  // ── API actions ────────────────────────────────────────
  async fetchDetails(): Promise<void> {
    if (!guildId) return;
    const data = await apiGet(`/api/v1/guilds/${guildId}`) as Record<string, unknown>;
    if (data.members) this.setMembers(data.members as Member[]);
    if (data.buildings) this.setBuildings(data.buildings as Building[]);
    if (data.resources) this.setResources(data.resources as Resource[]);
    if (data.workers) this.setWorkers(data.workers as Worker[]);
    this.render();
  },

  async createGuild(name: string): Promise<string | null> {
    const data = await apiPost('/api/v1/guilds', { name }) as { id?: string; invite_code?: string };
    if (data.id && data.invite_code) { this.setGuild(data.id, name, data.invite_code); return data.invite_code; }
    return null;
  },

  async joinGuild(gid: string, code: string): Promise<boolean> {
    const data = await apiPost(`/api/v1/guilds/${gid}/join`, { invite_code: code }) as Record<string, unknown>;
    if (data.guild_id) { await this.fetchDetails(); return true; }
    return false;
  },

  async build(buildingName: string): Promise<boolean> {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/build`, { building_name: buildingName }) as Record<string, unknown>;
    if (data.building) { await this.fetchDetails(); return true; }
    return false;
  },

  async assignWorkers(workerType: string, count: number): Promise<boolean> {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/workers`, { worker_type: workerType, count }) as Record<string, unknown>;
    return !!data.worker_type;
  },

  async withdraw(resourceName: string, amount: number): Promise<boolean> {
    if (!guildId) return false;
    const data = await apiPost(`/api/v1/guilds/${guildId}/resources/withdraw`, { resource_name: resourceName, amount }) as Record<string, unknown>;
    if (data.resource_name) { await this.fetchDetails(); return true; }
    return false;
  },

  // ── Render ─────────────────────────────────────────────
  render(): void {
    if (typeof document === 'undefined') return;
    let panel = document.querySelector('#guild-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'guild-panel';
      panel.className = 'guild-panel';
      const target = document.querySelector('#outsidePanel') ?? document.querySelector('#roomPanel');
      if (target) target.appendChild(panel);
    }

    if (!guildId) { (panel as HTMLElement).innerHTML = '<div class="guild-empty">Not in a guild</div>'; return; }

    const memberHtml = members.map(m => {
      const dot = m.online ? '<span class="online-dot">●</span>' : '<span class="offline-dot">○</span>';
      return `<div class="guild-member">${dot} ${m.display_name} <span class="role">${m.role}</span></div>`;
    }).join('');

    const buildingHtml = buildings.map(b => `<div>${b.building_name} (Lv.${b.level})</div>`).join('');
    const resourceHtml = resources.map(r => `<div>${r.resource_name}: ${Math.floor(r.quantity)}</div>`).join('');
    const workerHtml = workers.map(w => `<div>${w.worker_type}: ${w.count}</div>`).join('');

    (panel as HTMLElement).innerHTML = `
      <div class="guild-header">${guildName} <span class="invite-code">[${inviteCode}]</span></div>
      <div class="guild-section"><b>Members</b>${memberHtml}</div>
      <div class="guild-section"><b>Buildings</b>${buildingHtml || '<div>(none)</div>'}</div>
      <div class="guild-section"><b>Resources</b>${resourceHtml || '<div>(none)</div>'}</div>
      <div class="guild-section"><b>Workers</b>${workerHtml || '<div>(none)</div>'}</div>
    `;
  },
};
