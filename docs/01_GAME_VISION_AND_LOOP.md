# 01 — Game Vision and Core Loop

## High concept

Project Ashfall Ver 2.0 is a persistent grid strategy game in which each player commands a vulnerable base in a dangerous shared world. The player gathers Energy and Metal, ventures away from safety with offense troops, discovers caves, recovers tools, improves resource production, expands military strength, and eventually competes with other players.

## Central strategic tension

> Power taken into the field is power that is not defending home.

That rule should remain visible in nearly every military decision.

## Core loop

```text
EXPLORE
  ↓
GATHER ENERGY / METAL
  ↓
RETURN TO BASE
  ↓
UPGRADE COLLECTION / BASE
  ↓
RECRUIT & SPLIT TROOPS
  ↓
CLEAR CAVES / RAID
  ↓
GAIN TOOLS / RESOURCES
  ↓
EXPLORE FARTHER
```

## Loop A — Economy

1. Accumulate Energy and Metal
2. Spend on progression
3. Improve collection effectiveness
4. Reach more valuable objectives
5. Repeat at a faster but controlled pace

## Loop B — Exploration

1. Choose offense force
2. Leave base
3. Move tile-by-tile
4. Discover resource locations and caves
5. Decide whether to engage or return
6. Bring rewards home

## Loop C — Cave/tool progression

1. Locate cave
2. Commit offense strength
3. Resolve challenge
4. Receive tool reward
5. Equip Energy or Metal tool
6. Improve collection rate
7. Reach higher progression bands

## Loop D — Base risk

1. Decide how many troops stay
2. Send offense troops away
3. Base becomes more or less vulnerable
4. Player accepts strategic exposure for field opportunity

## First-session target

Phase 1 only verifies account foundation:

1. User creates account
2. Server creates player profile
3. Server finds a valid random base location
4. User enters protected `/game`
5. User sees:
   - base coordinate
   - Energy
   - Metal
   - account/player status

## First playable-world milestone

After later phases:

1. Enter map
2. Move several tiles
3. Collect both resources
4. Return home
5. Make first upgrade

## First memorable progression moment

- Player discovers a nearby cave
- Survives the cave
- Receives first collection tool
- Immediately sees a meaningful but not game-breaking improvement

## Design pillars

### Readability
Every important number has an understandable source.

### Persistence
Players build something that survives sessions.

### Fair randomness
Random does not mean unbounded.

### Opportunity cost
Resources, troop assignments, travel, and tool slots force choices.

### Recoverability
Early mistakes do not permanently ruin an account.

### Anti-snowball
Strong players gain advantages without permanently preventing new players from entering the world.

## UI tone

- old-school browser strategy
- industrial/post-collapse
- tactical status readouts
- restrained motion
- grid is the hero
- minimal decorative complexity
