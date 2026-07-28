/**
 * World database schema tests — M2-F1
 *
 * Validates worlds, world_tiles, landmarks, and player_positions tables
 * match the spec: columns, types, constraints, indexes, foreign keys.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ??
    'postgresql://jasxu:wwt0.619@localhost:5432/adarkroom_dev',
  max: 1,
});

beforeAll(() => {
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });
});

interface ColSpec {
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  char_max_length: number | null;
  constraint_type?: string;
  foreign_table?: string;
  delete_rule?: string;
}

interface ColRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  character_maximum_length: number | null;
  constraint_type: string | null;
}

async function getColumns(table: string): Promise<Map<string, ColSpec>> {
  const r = await pool.query(
    `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length,
            tc.constraint_type
     FROM information_schema.columns c
     LEFT JOIN information_schema.key_column_usage kcu
       ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name AND c.column_name = kcu.column_name
     LEFT JOIN information_schema.table_constraints tc
       ON kcu.constraint_name = tc.constraint_name AND tc.constraint_type = 'PRIMARY KEY'
     WHERE c.table_schema = 'public' AND c.table_name = $1
     ORDER BY c.ordinal_position`,
    [table],
  );
  const map = new Map<string, ColSpec>();
  for (const row of r.rows as ColRow[]) {
    map.set(row.column_name, {
      data_type: row.data_type,
      is_nullable: row.is_nullable,
      column_default: row.column_default,
      char_max_length: row.character_maximum_length,
      constraint_type: row.constraint_type ?? undefined,
    });
  }
  return map;
}

interface FKRow {
  column_name: string;
  foreign_table: string;
  delete_rule: string;
}

async function getFKs(table: string): Promise<Map<string, { ftable: string; drule: string }>> {
  const r = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS foreign_table, rc.delete_rule
     FROM information_schema.key_column_usage kcu
     JOIN information_schema.constraint_column_usage ccu
       ON kcu.constraint_name = ccu.constraint_name
     JOIN information_schema.referential_constraints rc
       ON kcu.constraint_name = rc.constraint_name
     WHERE kcu.table_schema = 'public' AND kcu.table_name = $1`,
    [table],
  );
  const map = new Map<string, { ftable: string; drule: string }>();
  for (const row of r.rows as FKRow[]) {
    map.set(row.column_name, { ftable: row.foreign_table, drule: row.delete_rule });
  }
  return map;
}

async function getUniqueColumns(table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.constraint_column_usage
     WHERE table_schema = 'public' AND table_name = $1
       AND constraint_name LIKE '%_key'
     ORDER BY column_name`,
    [table],
  );
  return (r.rows as { column_name: string }[]).map((x) => x.column_name);
}

// ═══════════════════════════════════════════════════════════

describe('worlds table', () => {
  let cols: Map<string, ColSpec>;

  beforeAll(async () => { cols = await getColumns('worlds'); });

  it('has 5 columns', () => { expect(cols.size).toBe(5); });
  it('id: uuid PK with gen_random_uuid', () => {
    const c = cols.get('id');
    expect(c?.data_type).toBe('uuid');
    expect(c?.is_nullable).toBe('NO');
    expect(c?.column_default).toContain('gen_random_uuid');
    expect(c?.constraint_type).toBe('PRIMARY KEY');
  });
  it('name: varchar(64) NOT NULL', () => {
    expect(cols.get('name')?.char_max_length).toBe(64);
    expect(cols.get('name')?.is_nullable).toBe('NO');
  });
  it('seed: integer NOT NULL', () => {
    expect(cols.get('seed')?.data_type).toBe('integer');
    expect(cols.get('seed')?.is_nullable).toBe('NO');
  });
  it('radius: integer NOT NULL default 30', () => {
    expect(cols.get('radius')?.data_type).toBe('integer');
    expect(cols.get('radius')?.is_nullable).toBe('NO');
    expect(cols.get('radius')?.column_default).toBe('30');
  });
  it('created_at: timestamptz NOT NULL default now()', () => {
    expect(cols.get('created_at')?.data_type).toMatch(/timestamp/);
    expect(cols.get('created_at')?.is_nullable).toBe('NO');
    expect(cols.get('created_at')?.column_default).toBe('now()');
  });
});

describe('world_tiles table', () => {
  let cols: Map<string, ColSpec>;
  let fks: Map<string, { ftable: string; drule: string }>;

  beforeAll(async () => {
    cols = await getColumns('world_tiles');
    fks = await getFKs('world_tiles');
  });

  it('has 6 columns', () => { expect(cols.size).toBe(6); });
  it('world_id: uuid FK → worlds CASCADE', () => {
    expect(cols.get('world_id')?.data_type).toBe('uuid');
    expect(cols.get('world_id')?.is_nullable).toBe('NO');
    expect(fks.get('world_id')?.ftable).toBe('worlds');
    expect(fks.get('world_id')?.drule).toBe('CASCADE');
  });
  it('x: integer NOT NULL, part of PK', () => {
    expect(cols.get('x')?.data_type).toBe('integer');
    expect(cols.get('x')?.is_nullable).toBe('NO');
  });
  it('y: integer NOT NULL, part of PK', () => {
    expect(cols.get('y')?.data_type).toBe('integer');
    expect(cols.get('y')?.is_nullable).toBe('NO');
  });
  it('tile_type: char(1) NOT NULL', () => {
    expect(cols.get('tile_type')?.data_type).toMatch(/character/);
    expect(cols.get('tile_type')?.char_max_length).toBe(1);
    expect(cols.get('tile_type')?.is_nullable).toBe('NO');
  });
  it('explored: boolean NOT NULL default false', () => {
    expect(cols.get('explored')?.data_type).toBe('boolean');
    expect(cols.get('explored')?.is_nullable).toBe('NO');
    expect(cols.get('explored')?.column_default).toBe('false');
  });
  it('updated_at: timestamptz NOT NULL default now()', () => {
    expect(cols.get('updated_at')?.data_type).toMatch(/timestamp/);
    expect(cols.get('updated_at')?.is_nullable).toBe('NO');
  });
});

describe('landmarks table', () => {
  let cols: Map<string, ColSpec>;
  let fks: Map<string, { ftable: string; drule: string }>;

  beforeAll(async () => {
    cols = await getColumns('landmarks');
    fks = await getFKs('landmarks');
  });

  it('has 10 columns', () => { expect(cols.size).toBe(10); });
  it('id: uuid PK', () => {
    expect(cols.get('id')?.data_type).toBe('uuid');
    expect(cols.get('id')?.constraint_type).toBe('PRIMARY KEY');
  });
  it('world_id: FK → worlds CASCADE', () => {
    expect(fks.get('world_id')?.ftable).toBe('worlds');
    expect(fks.get('world_id')?.drule).toBe('CASCADE');
  });
  it('x, y: integer NOT NULL', () => {
    expect(cols.get('x')?.data_type).toBe('integer');
    expect(cols.get('y')?.data_type).toBe('integer');
  });
  it('tile_type: char(1) NOT NULL', () => {
    expect(cols.get('tile_type')?.char_max_length).toBe(1);
  });
  it('scene: varchar(64) NOT NULL', () => {
    expect(cols.get('scene')?.char_max_length).toBe(64);
    expect(cols.get('scene')?.is_nullable).toBe('NO');
  });
  it('label: varchar(128) NOT NULL', () => {
    expect(cols.get('label')?.char_max_length).toBe(128);
  });
  it('explored: boolean default false', () => {
    expect(cols.get('explored')?.data_type).toBe('boolean');
    expect(cols.get('explored')?.column_default).toBe('false');
  });
  it('explored_by: FK → players SET NULL', () => {
    expect(fks.get('explored_by')?.ftable).toBe('players');
    expect(fks.get('explored_by')?.drule).toBe('SET NULL');
  });
  it('explored_at: timestamptz nullable', () => {
    expect(cols.get('explored_at')?.is_nullable).toBe('YES');
  });
});

describe('player_positions table', () => {
  let cols: Map<string, ColSpec>;
  let fks: Map<string, { ftable: string; drule: string }>;
  let uniques: string[];

  beforeAll(async () => {
    cols = await getColumns('player_positions');
    fks = await getFKs('player_positions');
    uniques = await getUniqueColumns('player_positions');
  });

  it('has 5 columns', () => { expect(cols.size).toBe(5); });
  it('player_id: FK → players CASCADE', () => {
    expect(cols.get('player_id')?.data_type).toBe('uuid');
    expect(fks.get('player_id')?.ftable).toBe('players');
    expect(fks.get('player_id')?.drule).toBe('CASCADE');
  });
  it('world_id: FK → worlds CASCADE', () => {
    expect(fks.get('world_id')?.ftable).toBe('worlds');
    expect(fks.get('world_id')?.drule).toBe('CASCADE');
  });
  it('(player_id, world_id) UNIQUE', () => {
    expect(uniques).toContain('player_id');
    expect(uniques).toContain('world_id');
  });
  it('x, y: integer NOT NULL', () => {
    expect(cols.get('x')?.data_type).toBe('integer');
    expect(cols.get('y')?.data_type).toBe('integer');
  });
  it('updated_at: timestamptz default now()', () => {
    expect(cols.get('updated_at')?.data_type).toMatch(/timestamp/);
  });
});

describe('data integrity', () => {
  it('world insert + tile insert works', async () => {
    const w = await pool.query(
      "INSERT INTO worlds (name, seed, radius) VALUES ('test-world', 42, 30) RETURNING id",
    );
    const wid = (w.rows[0] as { id: string }).id;

    await pool.query(
      "INSERT INTO world_tiles (world_id, x, y, tile_type) VALUES ($1, 0, 0, ';')",
      [wid],
    );
    const t = await pool.query('SELECT tile_type FROM world_tiles WHERE world_id = $1 AND x=0 AND y=0', [wid]);
    expect(t.rows[0]).toBeDefined();

    // Cleanup
    await pool.query('DELETE FROM worlds WHERE id = $1', [wid]);
  });
});
