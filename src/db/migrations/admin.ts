export const ADMIN_MIGRATION_SQL = `
ALTER TABLE players ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'HUMAN';
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_kind_check;
ALTER TABLE players ADD CONSTRAINT players_kind_check CHECK (kind IN ('HUMAN', 'BOT'));
CREATE UNIQUE INDEX IF NOT EXISTS players_display_name_lower_idx
  ON players (lower(display_name))
  WHERE display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS players_kind_idx ON players (kind);

CREATE TABLE IF NOT EXISTS bot_profiles (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  difficulty text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_tick_at timestamptz,
  last_action text,
  last_error text,
  tick_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_profiles_difficulty_check CHECK (difficulty IN ('SCOUT', 'RAIDER', 'WARLORD')),
  CONSTRAINT bot_profiles_tick_count_check CHECK (tick_count >= 0)
);
CREATE INDEX IF NOT EXISTS bot_profiles_enabled_idx ON bot_profiles (enabled, last_tick_at);
`;
