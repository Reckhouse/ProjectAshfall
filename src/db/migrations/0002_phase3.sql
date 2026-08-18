-- Phase 3: materialize Energy/Metal nodes without rewriting identity tables.

CREATE TABLE IF NOT EXISTS world_features (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES worlds(id),
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  feature_type text NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  generation_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT world_features_type_check CHECK (feature_type IN ('ENERGY_NODE', 'METAL_NODE')),
  CONSTRAINT world_features_unique_tile UNIQUE (world_id, x, y)
);
CREATE INDEX IF NOT EXISTS world_features_world_chunk_idx ON world_features (world_id, chunk_x, chunk_y);

CREATE TABLE IF NOT EXISTS resource_nodes (
  feature_id uuid PRIMARY KEY REFERENCES world_features(id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  capacity integer NOT NULL,
  remaining integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resource_nodes_type_check CHECK (resource_type IN ('ENERGY', 'METAL')),
  CONSTRAINT resource_nodes_remaining_check CHECK (remaining >= 0 AND remaining <= capacity)
);
