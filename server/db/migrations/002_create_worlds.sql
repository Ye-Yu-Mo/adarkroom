-- UP
CREATE TABLE IF NOT EXISTS worlds (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(64) NOT NULL,
  seed       INTEGER NOT NULL,
  radius     INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_tiles (
  world_id   UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  x          INTEGER NOT NULL CHECK (x >= 0),
  y          INTEGER NOT NULL CHECK (y >= 0),
  tile_type  CHAR(1) NOT NULL,
  explored   BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, x, y)
);

CREATE INDEX IF NOT EXISTS idx_world_tiles_world ON world_tiles(world_id);
CREATE INDEX IF NOT EXISTS idx_world_tiles_coords ON world_tiles(world_id, x, y);

CREATE TABLE IF NOT EXISTS landmarks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id     UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  x            INTEGER NOT NULL,
  y            INTEGER NOT NULL,
  tile_type    CHAR(1) NOT NULL,
  scene        VARCHAR(64) NOT NULL,
  label        VARCHAR(128) NOT NULL,
  explored     BOOLEAN NOT NULL DEFAULT false,
  explored_by  UUID REFERENCES players(id) ON DELETE SET NULL,
  explored_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_landmarks_world ON landmarks(world_id);
CREATE INDEX IF NOT EXISTS idx_landmarks_coords ON landmarks(world_id, x, y);

CREATE TABLE IF NOT EXISTS player_positions (
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  world_id   UUID NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, world_id)
);

CREATE INDEX IF NOT EXISTS idx_player_positions_world ON player_positions(world_id);

-- DOWN
DROP TABLE IF EXISTS player_positions;
DROP TABLE IF EXISTS landmarks;
DROP TABLE IF EXISTS world_tiles;
DROP TABLE IF EXISTS worlds;
