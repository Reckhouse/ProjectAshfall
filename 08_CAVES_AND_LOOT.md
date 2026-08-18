# 08 — Caves and Loot

## Role of caves

Caves connect exploration, military risk, and economic progression.

They should answer:

> Why should I leave my base and travel into uncertain territory?

## Cave lifecycle

Future model:

```text
UNDISCOVERED
  -> DISCOVERED
  -> AVAILABLE
  -> ENGAGED
  -> CLEARED
  -> COOLDOWN
  -> AVAILABLE
```

For the first cave implementation, a cave may simply be a one-time player clear.

## Cave tiers

| Cave Tier | Intended band | Reward tendency |
|---|---|---|
| 1 | beginner | mostly Tool Tier 1 |
| 2 | early | Tier 1–2 |
| 3 | mid | Tier 2–3 |
| 4 | late | Tier 3–4 |
| 5 | endgame | Tier 4–5 |

## First-clear rule

Recommended:

> A successful cave clear always awards a collection-tool outcome.

Caves are explicitly the tool acquisition system, so a no-tool clear undermines their purpose.

## Fair RNG requirements

- server RNG only
- versioned reward tables
- persisted reward before response
- idempotent claim
- duplicate claim protected by constraint
- deterministic tests with supplied seed
- bounded reward outcomes

## Category catch-up

When deciding Energy vs Metal affinity, give a moderate weight toward the player's weaker slot.

Example:

```text
Energy equipped: Tier 3
Metal equipped: Tier 1

Metal tool affinity becomes more likely.
```

Do not make it guaranteed.

## Placement

- never on base tile
- avoid immediate base safety area
- minimum cave separation
- each active beginner region gets accessible low-tier caves
- higher tiers trend farther from beginner density
- density tested statistically

## Cave difficulty

Begin with few variables.

Potential inputs:
- cave tier
- offense troop count
- offense troop quality
- bounded RNG

Add Energy entry costs, special enemies, or other systems only after base model works.

## Anti-farming

If refreshable caves are introduced:

- cooldown server-owned
- claim rate limited
- reward version explicit
- low-tier repetitive farming may have diminishing utility

## Required telemetry

- cave tier
- player progression band
- distance from base
- offense committed
- result
- casualties
- tool affinity
- tool tier
- whether reward improved best equipped tool
- time since last clear
