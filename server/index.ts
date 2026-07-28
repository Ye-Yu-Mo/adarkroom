/**
 * Server entry point — Express HTTP + WebSocket on a single port.
 *
 *   import { startServer } from './index';
 *   const { httpServer, port } = await startServer();
 *
 * Health check: GET /api/health → { ok: true, version, online }
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { config } from './config';
import { registerAuthRoutes } from './auth/handler';
import { registerWorldRoutes } from './world/handler';
import { registerGuildRoutes } from './village/handler';
import { query } from './db/pool';
import { seedDefaultWorld } from './world/seed';
import { createWsServer, WsManager } from './ws/index';

export async function startServer(): Promise<{
  httpServer: ReturnType<typeof createServer>;
  port: number;
}> {
  const app = express();
  app.use(express.json());
  app.use(cors({ origin: config.cors.origin }));

  // Create the WebSocket manager BEFORE building routes that reference it
  const wsManager = new WsManager();

  // Guild connect/disconnect → member_online broadcast
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  wsManager.onConnect = async (playerId: string) => {
    try {
      const r = await query('SELECT guild_id FROM guild_members WHERE player_id = $1', [playerId]);
      if (r.rows.length > 0) {
        const guildId = (r.rows[0] as { guild_id: string }).guild_id;
        const members = await query('SELECT player_id FROM guild_members WHERE guild_id = $1', [guildId]);
        const ids = (members.rows as { player_id: string }[]).map(m => m.player_id);
        wsManager.broadcast(ids, { type: 'guild:member_online', payload: { playerId, online: true } });
      }
    } catch { /* ignore */ }
  };
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  wsManager.onDisconnect = async (playerId: string) => {
    try {
      const r = await query('SELECT guild_id FROM guild_members WHERE player_id = $1', [playerId]);
      if (r.rows.length > 0) {
        const guildId = (r.rows[0] as { guild_id: string }).guild_id;
        const members = await query('SELECT player_id FROM guild_members WHERE guild_id = $1', [guildId]);
        const ids = (members.rows as { player_id: string }[]).map(m => m.player_id);
        wsManager.broadcast(ids, { type: 'guild:member_online', payload: { playerId, online: false } });
      }
    } catch { /* ignore */ }
  };

  // Auth routes
  app.use('/api/v1/auth', registerAuthRoutes());

  // World routes (needs wsManager for broadcasting)
  app.use('/api/v1/world', registerWorldRoutes(wsManager));
  app.use('/api/v1/guilds', registerGuildRoutes(wsManager));

  // Health check — references wsManager via closure
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '1.4.0', online: wsManager.getOnlineCount() });
  });

  // Create HTTP server and attach WebSocket upgrade handler
  const httpServer = createServer(app);
  createWsServer(httpServer, wsManager);
  wsManager.startHeartbeat(config.ws.heartbeatInterval);

  // Seed the default world on first boot
  await seedDefaultWorld();

  // Start listening
  await new Promise<void>((resolve) => {
    httpServer.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[adr-server] listening on :${config.port} (HTTP + WS)`);
      resolve();
    });
  });

  return { httpServer, port: config.port };
}

// Standalone execution
const isMain = process.argv[1]?.endsWith('/index.ts') ?? process.argv[1]?.endsWith('/index.js') ?? false;
if (isMain) {
  startServer().catch((err: unknown) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
