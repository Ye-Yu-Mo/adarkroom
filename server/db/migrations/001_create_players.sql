-- UP
CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(24) NOT NULL,
  device_id    VARCHAR(64) NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX idx_players_device_id ON players(device_id);

CREATE TABLE auth_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_auth_tokens_player ON auth_tokens(player_id);
CREATE INDEX idx_auth_tokens_hash   ON auth_tokens(token_hash);

-- DOWN
DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS players;
