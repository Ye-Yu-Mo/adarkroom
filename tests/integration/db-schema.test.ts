/**
 * Database schema validation tests — M1-F4
 *
 * Validates that the Players and auth_tokens tables
 * match the spec exactly: column names, types, nullability,
 * defaults, primary keys, foreign keys, indexes, and constraints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');

// Ensure migrations are applied before schema tests
beforeAll(() => {
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ??
    'postgresql://jasxu:wwt0.619@localhost:5432/adarkroom_dev',
  max: 1,
});

afterAll(async () => {
  await pool.end();
});

// ── Helper: fetch all columns for a table ─────────────────

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

async function getColumns(table: string): Promise<Map<string, ColumnInfo>> {
  const result = await pool.query(
    `SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  const map = new Map<string, ColumnInfo>();
  for (const row of result.rows) {
    const r = row as ColumnInfo;
    map.set(r.column_name, r);
  }
  return map;
}

// ── Helper: fetch all indexes for a table ─────────────────

interface IndexInfo {
  indexname: string;
  indexdef: string;
}

async function getIndexes(table: string): Promise<IndexInfo[]> {
  const result = await pool.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [table],
  );
  return result.rows as IndexInfo[];
}

// ── Helper: fetch foreign key constraints ─────────────────

interface FKInfo {
  constraint_name: string;
  delete_rule: string;
}

async function getForeignKeys(table: string): Promise<FKInfo[]> {
  const result = await pool.query(
    `SELECT
       tc.constraint_name,
       rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.referential_constraints rc
       ON tc.constraint_name = rc.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type = 'FOREIGN KEY'`,
    [table],
  );
  return result.rows as FKInfo[];
}

// ── Helper: fetch primary key ─────────────────────────────

async function getPrimaryKey(table: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.key_column_usage
     WHERE table_schema = 'public' AND table_name = $1
       AND constraint_name LIKE '%_pkey'
     LIMIT 1`,
    [table],
  );
  const row = result.rows[0] as { column_name: string } | undefined;
  return row?.column_name ?? null;
}

// ── Helper: fetch unique constraints ──────────────────────

async function getUniqueConstraints(table: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT column_name
     FROM information_schema.constraint_column_usage
     WHERE table_schema = 'public' AND table_name = $1
       AND constraint_name LIKE '%_key'
     ORDER BY column_name`,
    [table],
  );
  return (result.rows as { column_name: string }[]).map((r) => r.column_name);
}

// ═══════════════════════════════════════════════════════════
//  Tests
// ═══════════════════════════════════════════════════════════

describe('Players table', () => {
  let cols: Map<string, ColumnInfo>;
  let indexes: IndexInfo[];
  let pk: string | null;

  beforeAll(async () => {
    cols = await getColumns('players');
    indexes = await getIndexes('players');
    pk = await getPrimaryKey('players');
  });

  it('has exactly 6 columns', () => {
    expect(cols.size).toBe(6);
  });

  describe('id', () => {
    it('has type uuid', () => {
      expect(cols.get('id')?.data_type).toBe('uuid');
    });
    it('is NOT NULL', () => {
      expect(cols.get('id')?.is_nullable).toBe('NO');
    });
    it('is the primary key', () => {
      expect(pk).toBe('id');
    });
    it('auto-generates via gen_random_uuid()', () => {
      expect(cols.get('id')?.column_default).toContain('gen_random_uuid');
    });
  });

  describe('display_name', () => {
    it('has type character varying(24)', () => {
      const c = cols.get('display_name');
      expect(c?.data_type).toBe('character varying');
      expect(c?.character_maximum_length).toBe(24);
    });
    it('is NOT NULL', () => {
      expect(cols.get('display_name')?.is_nullable).toBe('NO');
    });
  });

  describe('device_id', () => {
    it('has type character varying(64)', () => {
      const c = cols.get('device_id');
      expect(c?.data_type).toBe('character varying');
      expect(c?.character_maximum_length).toBe(64);
    });
    it('is NOT NULL', () => {
      expect(cols.get('device_id')?.is_nullable).toBe('NO');
    });
    it('has a UNIQUE constraint', async () => {
      const uniques = await getUniqueConstraints('players');
      expect(uniques).toContain('device_id');
    });
  });

  describe('created_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('created_at')?.data_type).toBe('timestamp with time zone');
    });
    it('is NOT NULL', () => {
      expect(cols.get('created_at')?.is_nullable).toBe('NO');
    });
    it('defaults to now()', () => {
      expect(cols.get('created_at')?.column_default).toBe('now()');
    });
  });

  describe('last_seen_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('last_seen_at')?.data_type).toBe('timestamp with time zone');
    });
    it('is NOT NULL', () => {
      expect(cols.get('last_seen_at')?.is_nullable).toBe('NO');
    });
    it('defaults to now()', () => {
      expect(cols.get('last_seen_at')?.column_default).toBe('now()');
    });
  });

  describe('deleted_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('deleted_at')?.data_type).toBe('timestamp with time zone');
    });
    it('IS nullable (soft delete)', () => {
      expect(cols.get('deleted_at')?.is_nullable).toBe('YES');
    });
    it('has no default', () => {
      expect(cols.get('deleted_at')?.column_default).toBeNull();
    });
  });

  describe('indexes', () => {
    it('has idx_players_device_id on device_id', () => {
      const idx = indexes.find((i) => i.indexname === 'idx_players_device_id');
      expect(idx).toBeDefined();
      expect(idx?.indexdef).toContain('device_id');
    });
  });
});

describe('auth_tokens table', () => {
  let cols: Map<string, ColumnInfo>;
  let indexes: IndexInfo[];
  let fks: FKInfo[];
  let pk: string | null;

  beforeAll(async () => {
    cols = await getColumns('auth_tokens');
    indexes = await getIndexes('auth_tokens');
    fks = await getForeignKeys('auth_tokens');
    pk = await getPrimaryKey('auth_tokens');
  });

  it('has exactly 6 columns', () => {
    expect(cols.size).toBe(6);
  });

  describe('id', () => {
    it('has type uuid', () => {
      expect(cols.get('id')?.data_type).toBe('uuid');
    });
    it('is the primary key', () => {
      expect(pk).toBe('id');
    });
    it('auto-generates', () => {
      expect(cols.get('id')?.column_default).toContain('gen_random_uuid');
    });
  });

  describe('player_id', () => {
    it('has type uuid', () => {
      expect(cols.get('player_id')?.data_type).toBe('uuid');
    });
    it('is NOT NULL', () => {
      expect(cols.get('player_id')?.is_nullable).toBe('NO');
    });
    it('references players(id) with CASCADE delete', () => {
      const fk = fks.find((f) => f.constraint_name.includes('player_id'));
      expect(fk).toBeDefined();
      expect(fk?.delete_rule).toBe('CASCADE');
    });
  });

  describe('token_hash', () => {
    it('has type character varying(128)', () => {
      const c = cols.get('token_hash');
      expect(c?.data_type).toBe('character varying');
      expect(c?.character_maximum_length).toBe(128);
    });
    it('is NOT NULL', () => {
      expect(cols.get('token_hash')?.is_nullable).toBe('NO');
    });
    it('has a UNIQUE constraint', async () => {
      const uniques = await getUniqueConstraints('auth_tokens');
      expect(uniques).toContain('token_hash');
    });
  });

  describe('issued_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('issued_at')?.data_type).toBe('timestamp with time zone');
    });
    it('is NOT NULL', () => {
      expect(cols.get('issued_at')?.is_nullable).toBe('NO');
    });
    it('defaults to now()', () => {
      expect(cols.get('issued_at')?.column_default).toBe('now()');
    });
  });

  describe('expires_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('expires_at')?.data_type).toBe('timestamp with time zone');
    });
    it('is NOT NULL', () => {
      expect(cols.get('expires_at')?.is_nullable).toBe('NO');
    });
    it('has NO default (must be explicitly set)', () => {
      expect(cols.get('expires_at')?.column_default).toBeNull();
    });
  });

  describe('revoked_at', () => {
    it('has type timestamp with time zone', () => {
      expect(cols.get('revoked_at')?.data_type).toBe('timestamp with time zone');
    });
    it('IS nullable', () => {
      expect(cols.get('revoked_at')?.is_nullable).toBe('YES');
    });
    it('has no default', () => {
      expect(cols.get('revoked_at')?.column_default).toBeNull();
    });
  });

  describe('indexes', () => {
    it('has idx_auth_tokens_player on player_id', () => {
      const idx = indexes.find((i) => i.indexname === 'idx_auth_tokens_player');
      expect(idx).toBeDefined();
      expect(idx?.indexdef).toContain('player_id');
    });

    it('has idx_auth_tokens_hash on token_hash', () => {
      const idx = indexes.find((i) => i.indexname === 'idx_auth_tokens_hash');
      expect(idx).toBeDefined();
      expect(idx?.indexdef).toContain('token_hash');
    });
  });
});

describe('data integrity', () => {
  it('allows insert and select into players', async () => {
    const insert = await pool.query(
      `INSERT INTO players (display_name, device_id)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET last_seen_at = now()
       RETURNING id, display_name, created_at`,
      ['SchemaTest', 'test-device-schema-validation'],
    );
    const row = insert.rows[0] as { id: string; display_name: string; created_at: string };
    expect(row.display_name).toBe('SchemaTest');
    expect(row.id).toBeTruthy();
    expect(row.created_at).toBeTruthy();
  });

  it('rejects duplicate device_id', async () => {
    // Clean up any leftover from previous runs
    await pool.query("DELETE FROM auth_tokens WHERE player_id IN (SELECT id FROM players WHERE device_id IN ('dup-device-id-a', 'dup-device-id-b'))");
    await pool.query("DELETE FROM players WHERE device_id IN ('dup-device-id-a', 'dup-device-id-b')");

    await pool.query(
      `INSERT INTO players (display_name, device_id)
       VALUES ('dup-test-1', 'dup-device-id-a')`,
    );
    await expect(
      pool.query(
        `INSERT INTO players (display_name, device_id)
         VALUES ('dup-test-2', 'dup-device-id-a')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects display_name exceeding 24 chars', async () => {
    await expect(
      pool.query(
        `INSERT INTO players (display_name, device_id)
         VALUES ($1, $2)`,
        ['A'.repeat(25), 'long-name-device'],
      ),
    ).rejects.toThrow(/too long|value too long/i);
  });

  it('CASCADE deletes auth_tokens when player is deleted', async () => {
    const testDeviceId = `cascade-device-${Date.now()}`;
    const testHash = `sha256-cascade-hash-${Date.now()}`;

    // Create a test player
    const player = await pool.query(
      `INSERT INTO players (display_name, device_id)
       VALUES ('CascadeTest', $1)
       RETURNING id`,
      [testDeviceId],
    );
    const playerId = (player.rows[0] as { id: string }).id;

    // Create a token for them
    await pool.query(
      `INSERT INTO auth_tokens (player_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '1 hour')`,
      [playerId, testHash],
    );

    // Verify token exists
    const before = await pool.query(
      'SELECT COUNT(*) AS cnt FROM auth_tokens WHERE token_hash = $1',
      [testHash],
    );
    expect(Number(before.rows[0]?.cnt)).toBe(1);

    // Delete the player
    await pool.query('DELETE FROM players WHERE id = $1', [playerId]);

    // Token should be gone too (CASCADE)
    const after = await pool.query(
      'SELECT COUNT(*) AS cnt FROM auth_tokens WHERE token_hash = $1',
      [testHash],
    );
    expect(Number(after.rows[0]?.cnt)).toBe(0);
  });
});
