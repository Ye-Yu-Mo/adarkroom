/**
 * Database migration runner.
 *
 * Reads numbered .sql files from server/db/migrations/.
 * Each file contains both UP and DOWN sections separated by a marker.
 *
 * Usage:
 *   pnpm db:migrate           # Apply all pending migrations
 *   pnpm db:migrate:down      # Rollback the most recent migration
 *
 * SQL file format:
 *
 *   -- UP
 *   CREATE TABLE players (...);
 *
 *   -- DOWN
 *   DROP TABLE IF EXISTS players;
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

// ── Helpers ─────────────────────────────────────────────

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // 001_xxx.sql < 002_xxx.sql alphabetically
}

function parseMigration(filepath: string): { up: string; down: string } {
  const content = readFileSync(filepath, 'utf-8');
  const parts = content.split(/^-- DOWN$/m);
  const up = (parts[0] ?? '').replace(/^-- UP\n?/m, '').trim();
  const down = (parts[1] ?? '').trim();

  if (!up) {
    throw new Error(`Migration ${filepath} has no UP section`);
  }
  if (!down) {
    throw new Error(`Migration ${filepath} has no DOWN section`);
  }

  return { up, down };
}

async function ensureSchemaMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id        SERIAL PRIMARY KEY,
      filename  TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query('SELECT filename FROM schema_migrations ORDER BY id');
  return new Set(result.rows.map((r: { filename: string }) => r.filename));
}

// ── Commands ────────────────────────────────────────────

async function migrateUp(): Promise<void> {
  const pool = new Pool({ connectionString: config.db.url, max: 1 });
  try {
    await ensureSchemaMigrations(pool);
    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();

    let appliedCount = 0;
    for (const filename of files) {
      if (applied.has(filename)) continue;

      const filepath = join(MIGRATIONS_DIR, filename);
      const { up } = parseMigration(filepath);

      // eslint-disable-next-line no-console
      console.log(`[db] Applying: ${filename}`);
      await pool.query(up);
      await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
      appliedCount++;
    }

    if (appliedCount === 0) {
      // eslint-disable-next-line no-console
      console.log('[db] No pending migrations.');
    } else {
      // eslint-disable-next-line no-console
      console.log(`[db] Applied ${appliedCount} migration(s).`);
    }
  } finally {
    await pool.end();
  }
}

async function migrateDown(): Promise<void> {
  const pool = new Pool({ connectionString: config.db.url, max: 1 });
  try {
    await ensureSchemaMigrations(pool);
    const result = await pool.query(
      'SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1',
    );
    const row = result.rows[0] as { filename: string } | undefined;

    if (!row) {
      // eslint-disable-next-line no-console
      console.log('[db] No migrations to roll back.');
      return;
    }

    const filepath = join(MIGRATIONS_DIR, row.filename);
    const { down } = parseMigration(filepath);

    // eslint-disable-next-line no-console
    console.log(`[db] Rolling back: ${row.filename}`);
    await pool.query(down);
    await pool.query('DELETE FROM schema_migrations WHERE filename = $1', [row.filename]);
    // eslint-disable-next-line no-console
    console.log('[db] Rollback complete.');
  } finally {
    await pool.end();
  }
}

// ── CLI entry ───────────────────────────────────────────

const command = process.argv[2];

if (command === 'up') {
  await migrateUp();
} else if (command === 'down') {
  await migrateDown();
} else {
  console.error('Usage: node --import tsx server/db/migrate.ts <up|down>');
  process.exit(1);
}
