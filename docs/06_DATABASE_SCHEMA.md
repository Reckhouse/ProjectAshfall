# 06 — Database Schema

## Schema design objectives

- idempotent player provisioning
- strong database constraints
- efficient coordinate queries
- integer resource accounting
- future combat/caves without rewriting Phase 1 identity tables
- safe concurrency

## Authentication schema

Use Neon Auth-managed auth data.

Game tables reference the authenticated user identifier.

Do not duplicate password/account credential storage in custom game tables.

## `players`

```text
id                  uuid/text primary key
auth_user_id        unique, not null
status              PROVISIONING | ACTIVE | SUSPENDED
world_id            nullable during provisioning
created_at
updated_at
version             integer default 1
```

## `worlds`

```text
id
slug                unique
name
status              DRAFT | ACTIVE | CLOSED
seed
generation_version
balance_version
width
height
created_at
```

## `world_regions`

```text
id
world_id
min_x
max_x
min_y
max_y
spawn_enabled
spawn_weight
soft_player_cap
created_at
```

## `bases`

```text
id
world_id
player_id            unique
x
y
level
created_at
updated_at
version
```

Constraints:
- unique `(world_id, x, y)`
- initial one-base-per-player rule

Indexes:
- `(world_id, x, y)`
- `(world_id, x)`
- `(world_id, y)`

## `player_resources`

```text
player_id            primary key
energy               bigint not null
metal                bigint not null
energy_accrued_at
metal_accrued_at
updated_at
version
```

Checks:
- `energy >= 0`
- `metal >= 0`

## `game_actions`

Use for idempotent mutations.

```text
id
player_id
action_key           uuid/string
action_type
request_hash
status               STARTED | COMPLETED | FAILED
result_code
result_payload       jsonb optional
created_at
completed_at
```

Unique:
- `(player_id, action_key)`

## Future `world_features`

```text
id
world_id
chunk_x
chunk_y
feature_type         ENERGY_NODE | METAL_NODE | CAVE
x
y
generation_version
created_at
```

Unique:
- `(world_id, x, y, feature_type)`

## Future `resource_nodes`

```text
feature_id
resource_type        ENERGY | METAL
level
capacity
remaining
regen_at
version
```

## Future `caves`

```text
feature_id
tier
state
first_discovered_by
first_discovered_at
refresh_at
version
```

## Future `cave_clears`

```text
id
cave_id
player_id
reward_version
loot_seed_reference
cleared_at
```

Uniqueness depends on one-time vs refresh policy.

## Future `tool_instances`

```text
id
owner_player_id
resource_affinity    ENERGY | METAL
tool_type
tier
collection_bonus_bps
created_at
equipped_slot
```

Use basis points:
- 1000 = +10%
- 2500 = +25%

## Future `expeditions`

```text
id
player_id
world_id
x
y
status
started_at
updated_at
version
```

## Future `troop_stacks`

```text
id
player_id
location_type        BASE | EXPEDITION
location_id
unit_type
quantity
wounded
version
```

## `alliances`

```text
id
world_id
tag                  unique, case-insensitive
name
leader_player_id
created_at
updated_at
version
```

## `alliance_members`

```text
alliance_id
player_id            unique — one alliance per commander
role                 LEADER | MEMBER
joined_at
```

Constraints:
- primary key `(alliance_id, player_id)`
- bots never receive rows

## `alliance_invites`

```text
id
alliance_id
from_player_id
to_player_id
status               PENDING | ACCEPTED | DECLINED | REVOKED
created_at
```

Constraints:
- unique pending invite per `(alliance_id, to_player_id)`

## `mail_messages`

```text
id
world_id
kind                 DIRECT | ALLIANCE
from_player_id
to_player_id         required for DIRECT
alliance_id          required for ALLIANCE
body
created_at
```

## `mail_receipts`

```text
message_id
player_id
read_at              null until the recipient marks it
```

Constraints:
- primary key `(message_id, player_id)`
- inbox visibility is receipt-owned; the client cannot invent recipients

## Atomic resource spending

Bad:

```text
browser reads 500 Energy
browser computes 450
browser submits 450
```

Good:

```sql
UPDATE player_resources
SET energy = energy - :cost
WHERE player_id = :player
  AND energy >= :cost;
```

Verify one row changed.

## Optimistic concurrency

For mutable aggregates:

```sql
UPDATE entity
SET version = version + 1, ...
WHERE id = :id
  AND version = :expectedVersion;
```

If zero rows update:
- return `CONFLICT_RETRY`

## Migration rules

- never edit a migration already used in production
- schema change creates a new migration
- destructive change requires explicit plan
- seeds are repeatable
- preview deployments should use isolated database branches where practical
