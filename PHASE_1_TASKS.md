# Phase 1 Task Packet — Login, Account Creation, Random Base

## Goal

Complete the first playable infrastructure slice without implementing the actual map.

## P1-01 Phase 1 schema

Create:
- worlds
- world_regions
- players
- bases
- player_resources
- game_actions if included immediately

Acceptance:
- constraints from schema plan exist
- migration reviewed
- test database migrates cleanly

## P1-02 Active world seed

Create idempotent seed for:

```text
world: ashfall-01
status: ACTIVE
generation_version: 1
balance_version: 1
width: 2048
height: 2048
```

Create one spawn-enabled 512×512 region.

Acceptance:
- repeated seed does not duplicate world/region

## P1-03 Terrain validity abstraction

Create minimal interface:

```text
isPassable(world, x, y): boolean
isReserved(world, x, y): boolean
```

Phase 1 may return simple terrain rules, but keep generator boundary compatible with Phase 2.

Acceptance:
- deterministic tests
- bounds tests

## P1-04 Base spawn allocator

Implement server-only service.

Inputs:
- player
- active world
- RNG dependency

Outputs:
- valid coordinate

Rules:
- max 40 attempts
- 12-tile minimum base separation
- passable
- inside spawn region
- no collision

Acceptance:
- seeded tests
- dense-region test
- concurrent collision test
- controlled failure

## P1-05 Player provisioning

Implement:

```text
ensurePlayerProvisioned(authUserId)
```

Rules:
- idempotent
- transactionally safe
- one player
- one base
- one starting resource row
- starting Energy 250
- starting Metal 150
- ends ACTIVE

Acceptance:
- call twice => same player/base/resources
- concurrent calls => same logical result

## P1-06 Registration UI

Fields:
- email
- password
- confirm password

On successful auth:
- call provisioning
- redirect `/game`

Acceptance:
- validation
- safe errors
- loading state
- keyboard accessible

## P1-07 Login UI

On successful login:
- redirect `/game`

Acceptance:
- bad credentials handled safely
- already-authenticated behavior defined

## P1-08 Protected game page

Require server-verified session.

If player incomplete:
- invoke provisioning recovery

Display:
- world
- base coordinate
- Energy
- Metal
- base status
- logout

Acceptance:
- unauthenticated access blocked
- refresh shows same values

## P1-09 Logout

Acceptance:
- session invalidated
- `/game` no longer accessible

## P1-10 Full E2E

Flow:

```text
register
-> provision
-> capture base coordinate
-> refresh
-> same coordinate
-> logout
-> login
-> same coordinate
```

## P1-11 Security review

Attempt:
- call provision without auth
- submit arbitrary x/y
- submit arbitrary starting resources
- replay provision
- parallel provision

All must fail safely or remain idempotent.

## Phase 1 exit gate

Do not begin Phase 2 until:
- build green
- migration green
- E2E green
- concurrency test green
- base collision impossible by constraint
- client cannot influence spawn coordinate
