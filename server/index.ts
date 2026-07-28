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

  // Auth routes
  app.use('/api/v1/auth', registerAuthRoutes());

  // World routes (needs wsManager for broadcasting)
  app.use('/api/v1/world', registerWorldRoutes(wsManager));
  app.use('/api/v1/guilds', registerGuildRoutes());

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
