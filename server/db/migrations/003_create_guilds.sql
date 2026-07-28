-- UP
CREATE TABLE IF NOT EXISTS guilds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(48) NOT NULL,
  invite_code VARCHAR(6) NOT NULL UNIQUE,
  founder_id  UUID NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guilds_invite ON guilds(invite_code);

CREATE TABLE IF NOT EXISTS guild_members (
  guild_id   UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role       VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('founder', 'elder', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guild_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_members_player ON guild_members(player_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);

CREATE TABLE IF NOT EXISTS guild_buildings (
  guild_id      UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  building_name VARCHAR(48) NOT NULL,
  level         INTEGER NOT NULL DEFAULT 1 CHECK (level > 0),
  built_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, building_name)
);

CREATE TABLE IF NOT EXISTS guild_resources (
  guild_id      UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  resource_name VARCHAR(48) NOT NULL,
  quantity      DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  daily_limit   DOUBLE PRECISION NOT NULL DEFAULT 100,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, resource_name)
);

CREATE TABLE IF NOT EXISTS guild_workers (
  guild_id    UUID NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  worker_type VARCHAR(48) NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, worker_type)
);

-- DOWN
DROP TABLE IF EXISTS guild_workers;
DROP TABLE IF EXISTS guild_resources;
DROP TABLE IF EXISTS guild_buildings;
DROP TABLE IF EXISTS guild_members;
DROP TABLE IF EXISTS guilds;
