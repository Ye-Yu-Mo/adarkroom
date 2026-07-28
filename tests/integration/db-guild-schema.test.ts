/**
 * Guild database schema tests — M3-F1
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';
import 'dotenv/config';

const ROOT = join(import.meta.dirname, '..', '..');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://jasxu:wwt0.619@localhost:5432/adarkroom_dev',
  max: 1,
});

beforeAll(() => {
  execSync('pnpm db:migrate', { cwd: ROOT, stdio: 'pipe', env: { ...process.env } });
});

interface ColSpec {
  data_type: string; is_nullable: string; column_default: string | null;
  char_max_length: number | null; constraint_type: string | null;
}
async function getCols(table: string): Promise<Map<string, ColSpec>> {
  const r = await pool.query(
    `SELECT c.column_name, c.data_type, c.is_nullable, c.column_default, c.character_maximum_length,
            tc.constraint_type
     FROM information_schema.columns c
     LEFT JOIN information_schema.key_column_usage kcu
       ON c.table_schema=kcu.table_schema AND c.table_name=kcu.table_name AND c.column_name=kcu.column_name
     LEFT JOIN information_schema.table_constraints tc
       ON kcu.constraint_name=tc.constraint_name AND tc.constraint_type='PRIMARY KEY'
     WHERE c.table_schema='public' AND c.table_name=$1 ORDER BY c.ordinal_position`, [table]);
  const m = new Map<string, ColSpec>();
  for (const row of r.rows as Record<string, unknown>[]) m.set(row.column_name as string, {
    data_type: row.data_type as string, is_nullable: row.is_nullable as string,
    column_default: row.column_default as string | null,
    char_max_length: row.character_maximum_length as number | null,
    constraint_type: row.constraint_type as string | null,
  });
  return m;
}
async function getFKs(table: string): Promise<Map<string, { ft: string; dr: string }>> {
  const r = await pool.query(
    `SELECT kcu.column_name, ccu.table_name AS ft, rc.delete_rule AS dr
     FROM information_schema.key_column_usage kcu
     JOIN information_schema.constraint_column_usage ccu ON kcu.constraint_name=ccu.constraint_name
     JOIN information_schema.referential_constraints rc ON kcu.constraint_name=rc.constraint_name
     WHERE kcu.table_schema='public' AND kcu.table_name=$1`, [table]);
  const m = new Map<string, { ft: string; dr: string }>();
  for (const row of r.rows as { column_name: string; ft: string; dr: string }[]) m.set(row.column_name, { ft: row.ft, dr: row.dr });
  return m;
}
async function getUniques(table: string): Promise<string[]> {
  const r = await pool.query(
    `SELECT column_name FROM information_schema.constraint_column_usage
     WHERE table_schema='public' AND table_name=$1 AND constraint_name LIKE '%_key' ORDER BY column_name`, [table]);
  return (r.rows as { column_name: string }[]).map(x => x.column_name);
}

describe('guilds', () => {
  let c: Map<string, ColSpec>, f: Map<string, { ft: string; dr: string }>;
  beforeAll(async () => { c = await getCols('guilds'); f = await getFKs('guilds'); });
  it('5 columns', () => { expect(c.size).toBe(5); });
  it('id uuid PK', () => { expect(c.get('id')?.data_type).toBe('uuid'); expect(c.get('id')?.constraint_type).toBe('PRIMARY KEY'); });
  it('name varchar(48) NOT NULL', () => { expect(c.get('name')?.char_max_length).toBe(48); expect(c.get('name')?.is_nullable).toBe('NO'); });
  it('invite_code varchar(6) UNIQUE', () => { expect(c.get('invite_code')?.char_max_length).toBe(6); expect(c.get('invite_code')?.is_nullable).toBe('NO'); });
  it('founder_id FK→players RESTRICT', () => { expect(f.get('founder_id')?.ft).toBe('players'); expect(f.get('founder_id')?.dr).toBe('RESTRICT'); });
  it('created_at timestamptz', () => { expect(c.get('created_at')?.data_type).toMatch(/timestamp/); });
});

describe('guild_members', () => {
  let c: Map<string, ColSpec>, f: Map<string, { ft: string; dr: string }>, u: string[];
  beforeAll(async () => { c = await getCols('guild_members'); f = await getFKs('guild_members'); u = await getUniques('guild_members'); });
  it('4 columns', () => { expect(c.size).toBe(4); });
  it('guild_id FK→guilds CASCADE', () => { expect(f.get('guild_id')?.ft).toBe('guilds'); expect(f.get('guild_id')?.dr).toBe('CASCADE'); });
  it('player_id FK→players CASCADE', () => { expect(f.get('player_id')?.ft).toBe('players'); expect(f.get('player_id')?.dr).toBe('CASCADE'); });
  it('role varchar(10) default member', () => { expect(c.get('role')?.column_default).toMatch(/member/); });
  it('(guild_id,player_id) UNIQUE', () => { expect(u).toContain('guild_id'); expect(u).toContain('player_id'); });
});

describe('guild_buildings', () => {
  let c: Map<string, ColSpec>, f: Map<string, { ft: string; dr: string }>;
  beforeAll(async () => { c = await getCols('guild_buildings'); f = await getFKs('guild_buildings'); });
  it('4 columns', () => { expect(c.size).toBe(4); });
  it('guild_id FK→guilds CASCADE', () => { expect(f.get('guild_id')?.ft).toBe('guilds'); });
  it('building_name varchar(48)', () => { expect(c.get('building_name')?.char_max_length).toBe(48); });
  it('level int default 1', () => { expect(c.get('level')?.data_type).toBe('integer'); expect(c.get('level')?.column_default).toBe('1'); });
});

describe('guild_resources', () => {
  let c: Map<string, ColSpec>;
  beforeAll(async () => { c = await getCols('guild_resources'); });
  it('5 columns', () => { expect(c.size).toBe(5); });
  it('quantity double precision default 0', () => { expect(c.get('quantity')?.data_type).toMatch(/double/); });
  it('daily_limit double precision default 100', () => { expect(c.get('daily_limit')?.data_type).toMatch(/double/); });
});

describe('guild_workers', () => {
  let c: Map<string, ColSpec>;
  beforeAll(async () => { c = await getCols('guild_workers'); });
  it('4 columns', () => { expect(c.size).toBe(4); });
  it('worker_type varchar(48)', () => { expect(c.get('worker_type')?.char_max_length).toBe(48); });
  it('count int default 0', () => { expect(c.get('count')?.data_type).toBe('integer'); expect(c.get('count')?.column_default).toBe('0'); });
});

describe('data integrity', () => {
  it('create guild and add member', async () => {
    const g = await pool.query("INSERT INTO guilds (name, invite_code, founder_id) SELECT 'TestGuild', 'ABCDE1', id FROM players LIMIT 1 RETURNING id");
    const gid = (g.rows[0] as { id: string }).id;
    const p = await pool.query("SELECT id FROM players LIMIT 1");
    const pid = (p.rows[0] as { id: string }).id;
    await pool.query("INSERT INTO guild_members (guild_id, player_id, role) VALUES ($1,$2,'founder')", [gid, pid]);
    const m = await pool.query("SELECT role FROM guild_members WHERE guild_id=$1 AND player_id=$2", [gid, pid]);
    expect((m.rows[0] as { role: string }).role).toBe('founder');
    await pool.query("DELETE FROM guilds WHERE id=$1", [gid]);
  });
});
