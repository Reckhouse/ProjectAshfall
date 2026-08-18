# Balance Telemetry Specification

## Principle

Telemetry should answer design questions, not merely count clicks.

## Player progression band

Create a derived progression band such as:
- new
- early
- established
- advanced
- endgame

Do not use a hidden opaque score without documenting its inputs.

## Core economy events

### `resource_collected`
Fields:
- player_id
- resource_type
- amount
- source_type
- tool_bonus_bps
- node_tier
- world_id
- balance_version

### `resource_spent`
- resource_type
- amount
- sink_type
- resulting_balance
- progression_band

## Cave events

### `cave_attempted`
- cave_tier
- distance_from_base
- offense_committed
- progression_band

### `cave_resolved`
- success
- casualties
- reward_affinity
- reward_tier
- reward_improved_slot
- balance_version

## Spawn events

### `base_spawned`
- region_id
- attempt_count
- nearest_base_distance
- fairness_score
- generation_version

## Combat events

### `combat_resolved`
- attacker_power
- defender_power
- winner
- attacker_casualties
- defender_casualties
- base_defense_modifier
- combat_version

## Privacy

Use internal player IDs, not email addresses, for game telemetry.

## Balance versioning

Every balance-relevant event should carry:
- `balance_version`

Every generation event should also carry:
- `generation_version`

Without version labels, old and new rule data becomes difficult to compare.
