export const PHASE6_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS battle_reports (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  action_key text NOT NULL,
  kind text NOT NULL,
  cave_id uuid REFERENCES caves(feature_id) ON DELETE SET NULL,
  outcome text NOT NULL,
  seed text NOT NULL,
  attacker_committed integer NOT NULL,
  defender_committed integer NOT NULL,
  attacker_casualties integer NOT NULL,
  defender_casualties integer NOT NULL,
  attacker_power integer NOT NULL,
  defender_power integer NOT NULL,
  report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT battle_reports_player_action_unique UNIQUE (player_id, action_key),
  CONSTRAINT battle_reports_kind_check CHECK (kind IN ('CAVE')),
  CONSTRAINT battle_reports_outcome_check CHECK (outcome IN ('ATTACKER_WIN', 'DEFENDER_WIN')),
  CONSTRAINT battle_reports_qty_check CHECK (
    attacker_committed >= 0 AND defender_committed >= 0
    AND attacker_casualties >= 0 AND attacker_casualties <= attacker_committed
    AND defender_casualties >= 0 AND defender_casualties <= defender_committed
  )
);
CREATE INDEX IF NOT EXISTS battle_reports_player_idx ON battle_reports (player_id);
`;
