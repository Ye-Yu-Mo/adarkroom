/**
 * Server configuration — parsed and validated from environment variables.
 *
 * All configuration flows through this single module.
 * Environment variables are read ONCE at import time and validated with Zod.
 * Import this module anywhere you need config: `import { config } from './config';`
 *
 * @see SPEC.md §7 — 环境变量与配置
 */

import { z } from 'zod';
import 'dotenv/config';

// ── Individual schemas ──────────────────────────────────

const envSchema = z.enum(['development', 'production', 'test']);

const dbSchema = z.object({
  url: z.string().url().default('postgresql://adr:adarkroom_dev_pw@localhost:5432/adarkroom_dev'),
  poolSize: z.coerce.number().int().positive().default(10),
});

const authSchema = z.object({
  jwtSecret: z.string().min(1).default('change-me-in-production'),
  tokenExpiry: z.string().default('24h'),
});

const wsSchema = z.object({
  port: z.coerce.number().int().positive().default(3001),
  heartbeatInterval: z.coerce.number().int().positive().default(30_000),
});

const corsSchema = z.object({
  origin: z.string().default('http://localhost:8080'),
});

// ── Full config schema ──────────────────────────────────

const configSchema = z.object({
  env: envSchema.default('development'),
  port: z.coerce.number().int().positive().default(3000),
  db: dbSchema,
  auth: authSchema,
  ws: wsSchema,
  cors: corsSchema,
});

// ── Production safety check ─────────────────────────────

const rawConfig = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  db: {
    url: process.env.DATABASE_URL,
    poolSize: process.env.DB_POOL_SIZE,
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    tokenExpiry: process.env.JWT_TOKEN_EXPIRY,
  },
  ws: {
    port: process.env.WS_PORT,
    heartbeatInterval: process.env.WS_HEARTBEAT_INTERVAL,
  },
  cors: {
    origin: process.env.CORS_ORIGIN,
  },
};

const result = configSchema.safeParse(rawConfig);

if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid server configuration:\n${issues}`);
}

const parsed = result.data;

// Block default JWT secret in production
if (parsed.env === 'production' && parsed.auth.jwtSecret === 'change-me-in-production') {
  throw new Error(
    'FATAL: JWT_SECRET must be set to a secure random value in production.\n' +
      'Run: openssl rand -hex 64',
  );
}

// ── Export frozen config ────────────────────────────────

export const config = Object.freeze(parsed);

export type Config = typeof config;
