# Balance Metrics and Release Targets

## Why metrics exist

A balance parameter is not useful without knowing what outcome it is supposed to produce.

## Phase 1 metrics

### Spawn
Track:
- attempts per successful spawn
- p50/p95 spawn retries
- nearest-base distance distribution
- failed provisioning rate

Targets:
- p95 successful spawn attempts < 10
- no spacing violations
- practical provisioning failure rate approximately zero

## Economy metrics

Track by progression band:

- Energy earned per active hour
- Metal earned per active hour
- passive vs active share
- resource spent per day
- unspent stockpile
- time to first meaningful upgrade
- soft-lock incidence

Initial experience targets:

```text
first meaningful upgrade:
  15–35 minutes of active play

passive contribution:
  useful but not dominant

soft locks:
  0 by design
```

## Cave/tool metrics

Track:
- distance from base to first reachable T1 cave
- time to first cave
- time to first tool
- tool tier distribution
- affinity distribution
- duplicate/non-upgrade reward rate
- player improvement after reward

Initial targets:

```text
first reachable T1 cave:
  median 10–25 movement tiles

first useful tool:
  within first several successful cave clears

non-improving streak:
  bounded by catch-up/pity if telemetry requires it
```

## Combat metrics

Track:
- win rate by relative power
- casualty percent
- defender vs attacker
- combat duration/rounds if rounds exist
- resource loss
- recovery time

Targets:
- equal-cost base defender wins ~55–60%
- clearly stronger force normally wins
- ±5% RNG should create uncertainty, not chaos

## Progression metrics

- time to Tier 2 tools
- time to Tier 3 tools
- troop growth
- base upgrade cadence
- player power distribution

## Anti-snowball metrics

- strongest decile growth rate vs median
- recovery time after raid
- repeat victim rate
- account churn after loss events
- resource inequality over account age

## Balance gate

A system is not "balanced" because one playtest feels okay.

Require:
- simulation
- edge-case analysis
- telemetry plan
- live observations after release
