export const PHASE2_MIGRATION_SQL = `
ALTER TABLE players ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'BASE';
ALTER TABLE players ADD COLUMN IF NOT EXISTS x integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS y integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_move_at timestamptz;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_location_type_check;
ALTER TABLE players ADD CONSTRAINT players_location_type_check CHECK (location_type IN ('BASE', 'FIELD'));
CREATE INDEX IF NOT EXISTS players_world_coord_idx ON players (world_id, x, y);
`;
