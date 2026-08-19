export const PHASE5_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS expeditions (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  world_id uuid NOT NULL REFERENCES worlds(id),
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT expeditions_status_check CHECK (status IN ('ACTIVE', 'RETURNED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS expeditions_one_active ON expeditions (player_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS expeditions_player_idx ON expeditions (player_id);

CREATE TABLE IF NOT EXISTS troop_stacks (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  location_type text NOT NULL,
  location_id uuid NOT NULL,
  unit_type text NOT NULL,
  quantity integer NOT NULL,
  wounded integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT troop_stacks_type_check CHECK (unit_type IN ('DEFENSE', 'OFFENSE')),
  CONSTRAINT troop_stacks_location_check CHECK (location_type IN ('BASE', 'EXPEDITION')),
  CONSTRAINT troop_stacks_qty_check CHECK (quantity >= 0 AND wounded >= 0 AND wounded <= quantity),
  CONSTRAINT troop_stacks_defense_home_check CHECK (unit_type <> 'DEFENSE' OR location_type = 'BASE'),
  CONSTRAINT troop_stacks_assignment_unique UNIQUE (player_id, location_type, location_id, unit_type)
);
CREATE INDEX IF NOT EXISTS troop_stacks_player_idx ON troop_stacks (player_id);
`;
