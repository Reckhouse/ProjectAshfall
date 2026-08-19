ALTER TABLE bases ADD COLUMN IF NOT EXISTS storage_level integer NOT NULL DEFAULT 1;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS defender_player_id uuid REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS energy_looted integer NOT NULL DEFAULT 0;
ALTER TABLE battle_reports ADD COLUMN IF NOT EXISTS metal_looted integer NOT NULL DEFAULT 0;
ALTER TABLE battle_reports DROP CONSTRAINT IF EXISTS battle_reports_kind_check;
ALTER TABLE battle_reports ADD CONSTRAINT battle_reports_kind_check CHECK (kind IN ('CAVE', 'PVP'));
ALTER TABLE battle_reports DROP CONSTRAINT IF EXISTS battle_reports_qty_check;
ALTER TABLE battle_reports ADD CONSTRAINT battle_reports_qty_check CHECK (
  attacker_committed >= 0 AND defender_committed >= 0
  AND attacker_casualties >= 0 AND attacker_casualties <= attacker_committed
  AND defender_casualties >= 0 AND defender_casualties <= defender_committed
  AND energy_looted >= 0 AND metal_looted >= 0
);
CREATE TABLE IF NOT EXISTS raid_cooldowns (
  attacker_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  defender_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  last_raid_at timestamptz NOT NULL,
  CONSTRAINT raid_cooldowns_pair_unique UNIQUE (attacker_player_id, defender_player_id)
);
CREATE INDEX IF NOT EXISTS raid_cooldowns_defender_idx ON raid_cooldowns (defender_player_id);
