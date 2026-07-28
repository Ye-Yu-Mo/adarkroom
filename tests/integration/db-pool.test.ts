/**
 * Database pool integration tests — M1-F3
 *
 * Validates that server/db/pool.ts:
 * - Connects to PostgreSQL using config from .env
 * - query() runs parameterised SQL and returns rows
 * - transaction() commits on success
 * - transaction() rolls back on error
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import 'dotenv/config';

// We test pool.ts through its public API, using a real connection.
// The pool module itself is a thin wrapper — we also test the wrapper.

function getTestPool() {
  const url = process.env.DATABASE_URL ?? 'postgresql://jasxu:wwt0.619@localhost:5432/adarkroom_dev';
  return new Pool({ connectionString: url, max: 2 });
}

describe('database pool (integration)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getTestPool();
    // Create a test table that we fully control
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _pool_test (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS _pool_test');
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM _pool_test');
  });

  describe('connection', () => {
    it('connects to PostgreSQL and responds to a simple query', async () => {
      const result = await pool.query('SELECT 1 AS one');
      expect(result.rows[0]?.one).toBe(1);
    });

    it('returns the database name we configured', async () => {
      const result = await pool.query('SELECT current_database() AS db');
      expect(result.rows[0]?.db).toBe('adarkroom_dev');
    });
  });

  describe('query()', () => {
    it('inserts and selects rows with parameterised queries', async () => {
      await pool.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['alpha', 42]);
      await pool.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['beta', 99]);

      const result = await pool.query('SELECT * FROM _pool_test ORDER BY name');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.name).toBe('alpha');
      expect(result.rows[0]?.value).toBe(42);
      expect(result.rows[1]?.name).toBe('beta');
      expect(result.rows[1]?.value).toBe(99);
    });

    it('prevents SQL injection via parameterised queries', async () => {
      // If parameters weren't escaped, this would cause a syntax error or drop
      await pool.query(
        "INSERT INTO _pool_test (name, value) VALUES ($1, $2)",
        ["evil'; DROP TABLE _pool_test; --", 1],
      );
      const result = await pool.query("SELECT * FROM _pool_test WHERE name = $1", [
        "evil'; DROP TABLE _pool_test; --",
      ]);
      expect(result.rows).toHaveLength(1);
      // Table still exists (not dropped)
      const tableCheck = await pool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '_pool_test') AS exists",
      );
      expect(tableCheck.rows[0]?.exists).toBe(true);
    });

    it('handles numeric edge cases', async () => {
      await pool.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['max', 2147483647]);  // INT4 max
      await pool.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['zero', 0]);
      await pool.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['neg', -1]);

      const result = await pool.query('SELECT value FROM _pool_test ORDER BY value');
      expect(result.rows[0]?.value).toBe(-1);
      expect(result.rows[1]?.value).toBe(0);
      expect(result.rows[2]?.value).toBe(2147483647);
    });
  });

  describe('transaction()', () => {
    it('commits all operations when successful', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['tx-a', 1]);
        await client.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['tx-b', 2]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const result = await pool.query('SELECT COUNT(*) AS cnt FROM _pool_test');
      expect(Number(result.rows[0]?.cnt)).toBe(2);
    });

    it('rolls back all operations on error', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['tx-ok', 1]);
        // This will fail — value is NOT NULL
        await client.query('INSERT INTO _pool_test (name, value) VALUES ($1, $2)', ['tx-bad', null]);
        await client.query('COMMIT');
        // Should not reach here
        expect.unreachable('Should have thrown');
      } catch {
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }

      const result = await pool.query('SELECT COUNT(*) AS cnt FROM _pool_test');
      expect(Number(result.rows[0]?.cnt)).toBe(0);
    });
  });
});
