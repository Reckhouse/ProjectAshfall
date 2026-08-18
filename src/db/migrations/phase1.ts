export const PHASE1_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS worlds (
  id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL,
  seed text NOT NULL,
  generation_version integer NOT NULL,
  balance_version integer NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worlds_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  CONSTRAINT worlds_dims_check CHECK (width > 0 AND height > 0)
);

CREATE TABLE IF NOT EXISTS world_regions (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id),
  min_x integer NOT NULL,
  max_x integer NOT NULL,
  min_y integer NOT NULL,
  max_y integer NOT NULL,
  spawn_enabled boolean NOT NULL DEFAULT false,
  spawn_weight integer NOT NULL DEFAULT 1,
  soft_player_cap integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_regions_bounds_check CHECK (min_x <= max_x AND min_y <= max_y),
  CONSTRAINT world_regions_unique_bounds UNIQUE (world_id, min_x, min_y, max_x, max_y)
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY,
  auth_user_id text NOT NULL UNIQUE,
  status text NOT NULL,
  world_id uuid REFERENCES worlds(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT players_status_check CHECK (status IN ('PROVISIONING', 'ACTIVE', 'SUSPENDED'))
);

CREATE TABLE IF NOT EXISTS bases (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id),
  player_id uuid NOT NULL UNIQUE REFERENCES players(id),
  x integer NOT NULL,
  y integer NOT NULL,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT bases_world_coord_unique UNIQUE (world_id, x, y)
);
CREATE INDEX IF NOT EXISTS bases_world_x_idx ON bases(world_id, x);
CREATE INDEX IF NOT EXISTS bases_world_y_idx ON bases(world_id, y);

CREATE TABLE IF NOT EXISTS player_resources (
  player_id uuid PRIMARY KEY REFERENCES players(id),
  energy bigint NOT NULL,
  metal bigint NOT NULL,
  energy_accrued_at timestamptz NOT NULL DEFAULT now(),
  metal_accrued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT player_resources_energy_nonneg CHECK (energy >= 0),
  CONSTRAINT player_resources_metal_nonneg CHECK (metal >= 0)
);

CREATE TABLE IF NOT EXISTS game_actions (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id),
  action_key text NOT NULL,
  action_type text NOT NULL,
  request_hash text,
  status text NOT NULL,
  result_code text,
  result_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT game_actions_player_key_unique UNIQUE (player_id, action_key),
  CONSTRAINT game_actions_status_check CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED'))
);
`;
