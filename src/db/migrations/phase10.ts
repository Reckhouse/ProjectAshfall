export const MAIL_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS mail_messages (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id),
  kind text NOT NULL,
  from_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  alliance_id uuid REFERENCES alliances(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_messages_kind_check CHECK (kind IN ('DIRECT', 'ALLIANCE')),
  CONSTRAINT mail_messages_target_check CHECK (
    (kind = 'DIRECT' AND to_player_id IS NOT NULL AND alliance_id IS NULL) OR
    (kind = 'ALLIANCE' AND to_player_id IS NULL AND alliance_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS mail_messages_from_idx ON mail_messages (from_player_id, created_at);
CREATE INDEX IF NOT EXISTS mail_messages_to_idx ON mail_messages (to_player_id, created_at);
CREATE INDEX IF NOT EXISTS mail_messages_alliance_idx ON mail_messages (alliance_id, created_at);

CREATE TABLE IF NOT EXISTS mail_receipts (
  message_id uuid NOT NULL REFERENCES mail_messages(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  read_at timestamptz,
  PRIMARY KEY (message_id, player_id)
);
CREATE INDEX IF NOT EXISTS mail_receipts_player_unread_idx ON mail_receipts (player_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS mail_receipts_player_idx ON mail_receipts (player_id);
`;
