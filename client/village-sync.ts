/**
 * Village sync — subscribes to WebSocket events for real-time guild updates.
 *
 * Hooks into the Multiplayer module to listen for guild-related
 * server push events and update GuildState accordingly.
 */

import { GuildState } from './guild';

let initialized = false;

export const VillageSync = {
  init(): void {
    if (initialized) return;
    initialized = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mp = (window as any).Multiplayer;
    if (!mp) return;

    mp.on('guild:resource_update', (_payload: unknown) => {
      GuildState.fetchDetails().catch(() => undefined);
    });

    mp.on('guild:building_complete', (_payload: unknown) => {
      GuildState.fetchDetails().catch(() => undefined);
    });

    mp.on('guild:member_online', (payload: { playerId: string; online: boolean }) => {
      GuildState.updateMemberOnline(payload.playerId, payload.online);
      GuildState.render();
    });
  },
};
