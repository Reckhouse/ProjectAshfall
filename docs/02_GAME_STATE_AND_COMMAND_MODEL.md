# 02 — Game State and Command Model

## Authority split

### Client may own
- camera position
- selected tile
- hover state
- local key state
- animation
- open/closed panels
- requested command

### Server owns
- identity
- world
- base coordinate
- player coordinate
- Energy
- Metal
- production timestamps
- node state
- cave state
- tool inventory
- equipped tools
- troop quantities
- expedition assignments
- combat
- cooldowns
- loot
- spawn legality
- alliance membership and tags

## Command pattern

Good:

```http
POST /api/game/move
{
  "direction": "north",
  "actionId": "client-uuid"
}
```

Server derives:
- legal destination
- movement cost
- encounter
- updated coordinate
- final Energy

Bad:

```http
POST /api/game/player
{
  "x": 840,
  "y": 911,
  "energy": 999999
}
```

## Player lifecycle

```text
AUTHENTICATED
  -> PROVISIONING
  -> ACTIVE_AT_BASE
  -> ACTIVE_IN_FIELD
  -> IN_CAVE
  -> IN_COMBAT
  -> RETURNING
```

Phase 1 uses only the first three states.

## Critical invariants

- One active initial player profile per auth user
- One primary base per player
- Base coordinate is never browser-selected
- Resource balances never drop below zero
- Same troop cannot exist in base and expedition simultaneously
- Cave reward cannot be claimed twice under the same reward policy
- Tool instance belongs to one owner
- Retried idempotent action returns same logical result
- Persistent random outcomes are server-generated
- Ordinary movement changes position by one legal tile only

## Transaction rules

Use one transaction for actions like:

```text
spend Metal + recruit troops
move + pay Energy + update coordinate
clear cave + mark clear + grant tool
combat + casualties + loot
```

## Concurrency threats

Always assume:
- double clicks
- browser retry
- two tabs
- automation
- race conditions
- network retries after server commit

Use:
- unique constraints
- transactions
- idempotency keys
- version numbers
- atomic conditional updates
