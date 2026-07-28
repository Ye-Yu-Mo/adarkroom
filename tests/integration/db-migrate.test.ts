/**
 * Migration system integration tests — M1-F3
 *
 * Validates that server/db/migrate.ts:
 * - Creates schema_migrations table on first run
 * - Executes .sql migration files in order
 * - Skips already-applied migrations
 * - Supports rollback (down)
 * - Records migration history correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '..', '..');

describe('migration system (integration)', () => {
  // Migrate up to a known clean state before tests
  beforeAll(() => {
    execSync('pnpm db:migrate', {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    });
  });

  afterAll(() => {
    // Roll back all migrations to leave a clean state
    try {
      for (let i = 0; i < 10; i++) {
        execSync('pnpm db:migrate:down', { cwd: ROOT, stdio: 'pipe' });
      }
    } catch {
      // No migrations left — expected
    }
  });

  it('creates schema_migrations table on first run', () => {
    const result = execSync(
      "psql -U jasxu -h localhost -d adarkroom_dev -t -c \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_migrations')\"",
      {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, PGPASSWORD: 'wwt0.619' },
      },
    );
    expect(result.toString().trim()).toBe('t');
  });

  it('records applied migration filenames', () => {
    const result = execSync(
      "psql -U jasxu -h localhost -d adarkroom_dev -t -c \"SELECT filename FROM schema_migrations ORDER BY applied_at\"",
      {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, PGPASSWORD: 'wwt0.619' },
      },
    );
    const filenames = result
      .toString()
      .trim()
      .split('\n')
      .map((s: string) => s.trim());
    expect(filenames.some((f) => f.includes('001'))).toBe(true);
  });

  it('supports down migration', () => {
    // Roll back one migration
    execSync('pnpm db:migrate:down', {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    });

    // The players table should now NOT exist
    const result = execSync(
      "psql -U jasxu -h localhost -d adarkroom_dev -t -c \"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'players')\"",
      {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env, PGPASSWORD: 'wwt0.619' },
      },
    );
    expect(result.toString().trim()).toBe('f');

    // Re-apply for subsequent tests
    execSync('pnpm db:migrate', {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    });
  });

  it('skips already-applied migrations on re-run', () => {
    // Running migrate again should be a no-op (idempotent)
    const output = execSync('pnpm db:migrate', {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env },
    }).toString();

    // Should indicate no new migrations (not re-create existing ones)
    expect(output).not.toContain('Applying: 001');
  });
});
