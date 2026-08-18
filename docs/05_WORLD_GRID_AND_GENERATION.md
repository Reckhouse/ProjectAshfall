# 05 — World Grid and Generation

## Goal

Support a large persistent grid without creating a database row for every empty tile.

## Coordinate model

Initial recommendation:

```text
x = 0 .. width - 1
y = 0 .. height - 1
```

Directions:

```text
north: y - 1
south: y + 1
west:  x - 1
east:  x + 1
```

## Controls

Future client mapping:

| Action | Keyboard |
|---|---|
| North | Arrow Up / W |
| South | Arrow Down / S |
| West | Arrow Left / A |
| East | Arrow Right / D |

Input is only a request. Server validates every move.

## Chunking

Recommended:

```text
chunk_size = 32
chunk_x = floor(x / 32)
chunk_y = floor(y / 32)
```

The client loads visible chunks rather than the entire world.

## Generation layers

### Layer 1 — deterministic terrain
Derived from:
- world seed
- generation version
- x
- y

### Layer 2 — deterministic feature candidates
Candidate positions for:
- Energy nodes
- Metal nodes
- caves

### Layer 3 — persistent entities
Stored state for:
- player bases
- discovered/cleared caves
- mutable resource nodes
- special structures

## Do not store empty tiles

Avoid a `tiles` row for every coordinate.

Instead:

```text
terrain = function(worldSeed, generationVersion, x, y)
```

Persistent entities overlay deterministic terrain.

## Versioning rule

Every world stores:

```text
generation_version
balance_version
```

Never alter an existing world's terrain merely because generation code was edited.

New generation algorithm:
- new generation version
- new world/season or explicit migration

## Active spawn regions

Do not spawn players uniformly across an enormous empty map.

Use controlled spawn regions.

Suggested early region:

```text
512 x 512 tiles
```

Activate additional regions when population density reaches a configured threshold.

Benefits:
- players are not isolated
- cave/resource distribution remains meaningful
- world can scale outward

## Base spacing

Fast query:
1. search bounding box around candidate
2. exact distance check

Example exact check:

```text
dx = base.x - candidate.x
dy = base.y - candidate.y

reject if:
dx*dx + dy*dy < radius*radius
```

## Cave generation principles

- low-tier caves are reachable from new-player regions
- cave positions never overlap bases
- minimum cave spacing
- higher tiers trend farther from beginner clusters
- candidate generation is deterministic
- mutable cave state is persisted

## Resource nodes

Recommended hybrid:

```text
seeded candidate
  -> materialize when relevant chunk is first loaded
  -> mutable node state stored in Postgres
```

## Future chunk endpoint

Conceptual:

```http
GET /api/game/world/chunks?cx=12&cy=8&radius=2
```

Response:
- encoded terrain
- visible bases
- visible caves
- visible resource nodes
- player coordinate

## Performance rules

Avoid:
- DB query per tile
- ORM row per empty cell
- regenerating large world areas for every move
- sending entire world to browser
