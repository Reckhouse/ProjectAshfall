-- Phase 9 alliances: tags, membership, and pending invites;
CREATE TABLE IF NOT EXISTS alliances (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id),
  tag text NOT NULL,
  name text NOT NULL,
  leader_player_id uuid NOT NULL REFERENCES players(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS alliances_tag_lower_idx ON alliances (lower(tag));
CREATE INDEX IF NOT EXISTS alliances_world_idx ON alliances (world_id);
CREATE INDEX IF NOT EXISTS alliances_leader_idx ON alliances (leader_player_id);

CREATE TABLE IF NOT EXISTS alliance_members (
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  role text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alliance_id, player_id),
  CONSTRAINT alliance_members_role_check CHECK (role IN ('LEADER', 'MEMBER'))
);
CREATE UNIQUE INDEX IF NOT EXISTS alliance_members_player_unique ON alliance_members (player_id);

CREATE TABLE IF NOT EXISTS alliance_invites (
  id uuid PRIMARY KEY,
  alliance_id uuid NOT NULL REFERENCES alliances(id) ON DELETE CASCADE,
  from_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alliance_invites_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS alliance_invites_pending_unique
  ON alliance_invites (alliance_id, to_player_id)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS alliance_invites_to_idx ON alliance_invites (to_player_id, status);
