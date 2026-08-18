export const PHASE4_MIGRATION_SQL = `
ALTER TABLE world_features DROP CONSTRAINT IF EXISTS world_features_type_check;
ALTER TABLE world_features ADD CONSTRAINT world_features_type_check CHECK (feature_type IN ('ENERGY_NODE', 'METAL_NODE', 'CAVE'));

CREATE TABLE IF NOT EXISTS caves (
  feature_id uuid PRIMARY KEY REFERENCES world_features(id) ON DELETE CASCADE,
  tier integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cave_clears (
  id uuid PRIMARY KEY,
  cave_id uuid NOT NULL REFERENCES caves(feature_id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reward_version integer NOT NULL,
  tool_id uuid,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cave_clears_player_cave_unique UNIQUE (player_id, cave_id)
);

CREATE TABLE IF NOT EXISTS tool_instances (
  id uuid PRIMARY KEY,
  owner_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  resource_affinity text NOT NULL,
  tier integer NOT NULL,
  collection_bonus_bps integer NOT NULL,
  equipped_slot text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_instances_affinity_check CHECK (resource_affinity IN ('ENERGY', 'METAL')),
  CONSTRAINT tool_instances_slot_check CHECK (equipped_slot IS NULL OR equipped_slot IN ('ENERGY', 'METAL'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tool_instances_equipped_slot_unique ON tool_instances (owner_player_id, equipped_slot) WHERE equipped_slot IS NOT NULL;
CREATE INDEX IF NOT EXISTS tool_instances_owner_idx ON tool_instances (owner_player_id);
`;
