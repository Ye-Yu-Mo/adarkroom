/**
 * Guild client tests — M3-F3
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GuildState: any;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('location', { protocol: 'http:', hostname: 'localhost', port: '3400' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => ({ ok: true, data: {} }) }));
  const mod = await import('../../client/guild');
  GuildState = mod.GuildState;
});

describe('GuildState', () => {
  it('starts uninitialized', () => {
    expect(GuildState.isJoined()).toBe(false);
    expect(GuildState.getGuildId()).toBeNull();
  });

  it('setGuild stores guild data', () => {
    GuildState.setGuild('g1', 'TestGuild', 'ABC123');
    expect(GuildState.isJoined()).toBe(true);
    expect(GuildState.getGuildId()).toBe('g1');
    expect(GuildState.getInviteCode()).toBe('ABC123');
  });

  it('setMembers updates member list', () => {
    GuildState.setMembers([
      { player_id: 'p1', display_name: 'Alice', role: 'founder' },
      { player_id: 'p2', display_name: 'Bob', role: 'member' },
    ]);
    const members = GuildState.getMembers();
    expect(members).toHaveLength(2);
    expect(members[0].display_name).toBe('Alice');
  });

  it('updateMemberOnline toggles online status', () => {
    GuildState.setMembers([{ player_id: 'p1', display_name: 'Alice', role: 'founder' }]);
    GuildState.updateMemberOnline('p1', true);
    expect(GuildState.getMembers()[0].online).toBe(true);
    GuildState.updateMemberOnline('p1', false);
    expect(GuildState.getMembers()[0].online).toBe(false);
  });

  it('setBuildings stores building data', () => {
    GuildState.setBuildings([{ building_name: 'hut', level: 2 }]);
    expect(GuildState.getBuildingLevel('hut')).toBe(2);
    expect(GuildState.getBuildingLevel('workshop')).toBe(0);
  });

  it('setResources stores resource data', () => {
    GuildState.setResources([{ resource_name: 'wood', quantity: 500, daily_limit: 100 }]);
    const r = GuildState.getResource('wood');
    expect(r.quantity).toBe(500);
    expect(r.daily_limit).toBe(100);
    expect(GuildState.getResource('iron')).toBeNull();
  });

  it('setWorkers stores worker data', () => {
    GuildState.setWorkers([{ worker_type: 'gatherer', count: 5 }]);
    expect(GuildState.getWorkerCount('gatherer')).toBe(5);
    expect(GuildState.getWorkerCount('hunter')).toBe(0);
  });

  it('leave clears all state', () => {
    GuildState.setGuild('g1', 'Test', 'XYZ');
    GuildState.leave();
    expect(GuildState.isJoined()).toBe(false);
    expect(GuildState.getMembers()).toEqual([]);
  });
});
