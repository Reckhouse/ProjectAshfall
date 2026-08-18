# Balance Baseline — Draft v0

## Status

These are **starting simulation values**, not final game rules.

Every value must live in versioned code config when implemented.

Recommended config path:

```text
src/game/config/balance.v1.ts
```

## Phase 1 starting values

```yaml
starting_resources:
  energy: 250
  metal: 150

world:
  initial_width: 2048
  initial_height: 2048
  chunk_size: 32
  active_spawn_region_size: 512

spawn:
  base_exclusion_radius: 12
  attempt_limit: 40
```

World size is a planning baseline. Active spawn regions prevent early players from being spread across all 2048×2048 tiles.

## Economy draft

```yaml
passive:
  energy_per_hour: 12
  metal_per_hour: 6

nodes:
  energy_base_yield: 30
  metal_base_yield: 18
```

Target:
- passive keeps account alive
- active collection feels several times more productive than waiting

## Tool draft

```yaml
tool_bonus_bps:
  tier_1: 1000
  tier_2: 2200
  tier_3: 3800
  tier_4: 6000
  tier_5: 9000
```

## Cave draft

```yaml
cave_target_density:
  tier_1_per_1000_tiles: 5.0
  tier_2_per_1000_tiles: 2.5
  tier_3_per_1000_tiles: 1.0
  tier_4_per_1000_tiles: 0.35
  tier_5_per_1000_tiles: 0.10
```

These are candidate densities and must be tested for nearest-cave distance.

## Tool rarity by cave tier

Percentages sum to 100.

```text
Cave T1 -> Tool T1 92%, T2 8%
Cave T2 -> Tool T1 45%, T2 50%, T3 5%
Cave T3 -> Tool T2 45%, T3 48%, T4 7%
Cave T4 -> Tool T3 45%, T4 50%, T5 5%
Cave T5 -> Tool T4 60%, T5 40%
```

## Combat draft

Not implemented until later phase.

```yaml
combat:
  variance_min: 0.95
  variance_max: 1.05
  target_equal_cost_defender_win_rate_min: 0.55
  target_equal_cost_defender_win_rate_max: 0.60
```

## New-player PvP draft

```yaml
new_player_protection_hours: 72
```

Do not implement PvP protection until PvP exists.

## Balance rule

No agent may treat these values as sacred.

The purpose of the baseline is to provide a testable first hypothesis.
