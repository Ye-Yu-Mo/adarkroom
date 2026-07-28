/**
 * World seeding — ensures a default world exists on server startup.
 *
 * Called once at server boot. If no world exists, generates one
 * and inserts all tiles + landmarks into the database.
 */

import { query, transaction } from '../db/pool';
import { generateWorld } from './generator';

const DEFAULT_SEED = 42;
const DEFAULT_RADIUS = 30;
const DEFAULT_NAME = 'default';

export async function seedDefaultWorld(): Promise<void> {
  const existing = await query("SELECT id FROM worlds WHERE name = 'default'");
  if (existing.rows.length > 0) {
    // eslint-disable-next-line no-console
    console.log('[world] default world already exists');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[world] generating world with seed=${DEFAULT_SEED}...`);
  const world = generateWorld(DEFAULT_SEED, DEFAULT_RADIUS);

  await transaction(async (db) => {
    // Create the world record
    const w = await db.query(
      `INSERT INTO worlds (name, seed, radius)
       VALUES ($1, $2, $3) RETURNING id`,
      [DEFAULT_NAME, DEFAULT_SEED, DEFAULT_RADIUS],
    );
    const worldId: string = (w.rows[0] as { id: string }).id;

    // Bulk insert tiles (batched to avoid overflow)
    const BATCH = 1000;
    let values: string[] = [];
    let params: (string | number | boolean)[] = [];
    let paramIdx = 0;

    for (let y = 0; y < world.tiles.length; y++) {
      const row = world.tiles[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const tile = row[x];
        if (tile === undefined) continue;
        params.push(worldId, x, y, tile, false);
        paramIdx += 5;
        values.push(`($${paramIdx - 4}, $${paramIdx - 3}, $${paramIdx - 2}, $${paramIdx - 1}, $${paramIdx})`);

        if (values.length >= BATCH) {
          await db.query(
            `INSERT INTO world_tiles (world_id, x, y, tile_type, explored) VALUES ${values.join(',')}`,
            params,
          );
          values = [];
          params = [];
          paramIdx = 0;
        }
      }
    }

    // Flush remaining tiles
    if (values.length > 0) {
      await db.query(
        `INSERT INTO world_tiles (world_id, x, y, tile_type, explored) VALUES ${values.join(',')}`,
        params,
      );
    }

    // Insert landmarks
    for (const lm of world.landmarks) {
      await db.query(
        `INSERT INTO landmarks (world_id, x, y, tile_type, scene, label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [worldId, lm.x, lm.y, lm.tileType, lm.scene, lm.label],
      );
    }

    const tileCount = world.tiles.length * (world.tiles[0]?.length ?? 0);
    // eslint-disable-next-line no-console
    console.log(`[world] default world seeded: ${tileCount} tiles, ${world.landmarks.length} landmarks`);
  });
}
