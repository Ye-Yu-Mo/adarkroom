/**
 * PostgreSQL connection pool — thin wrapper around pg.Pool.
 *
 * All database access goes through this module.
 * Import config to get the connection string.
 *
 *   import { query, transaction } from './db/pool';
 *   const rows = await query('SELECT * FROM players WHERE id = $1', [id]);
 *   await transaction(async (db) => {
 *     await db.query('INSERT INTO ...');
 *     await db.query('UPDATE ...');
 *   });
 */

import { Pool, type PoolClient } from 'pg';
import { config } from '../config';

const pool = new Pool({
  connectionString: config.db.url,
  max: config.db.poolSize,
});

pool.on('error', (err) => {
  // An idle client emitted an error — log and continue.
  // The client is automatically removed from the pool.
  console.error('[db] unexpected pool error:', err.message);
});

/**
 * Run a single parameterised query. Returns pg's QueryResult.
 * Use for SELECT, single INSERT/UPDATE/DELETE.
 */
export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

/**
 * Execute multiple queries inside a transaction.
 * On success, all queries are committed.
 * If the callback throws, all queries are rolled back.
 * The client is always released back to the pool.
 */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Close all pool connections. Call on graceful shutdown. */
export async function closePool(): Promise<void> {
  await pool.end();
}
