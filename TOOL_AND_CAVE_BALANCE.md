# Tool and Cave Balance Plan

## Objective

Caves should reliably create progression without turning loot luck into account destiny.

## Tool outcome dimensions

- affinity: Energy or Metal
- tier
- whether reward improves current best
- magnitude of progression acceleration

## Cave reward goals

- successful cave clear feels valuable
- first tool comes early enough to teach the system
- high-tier tools remain aspirational
- repeated bad-luck streaks are bounded

## Base loot table

See `BALANCE_BASELINE.md`.

## Affinity weighting

Initial candidate:

```text
equal tool slots:
  Energy 50%
  Metal 50%

one slot >= 2 tiers behind:
  weaker slot 65%
  stronger slot 35%
```

This is a starting hypothesis.

## Duplicate streak metric

Simulate:
- 100k players
- first 20 cave clears
- current equipped state updated after each reward

Measure:
- clears until first upgrade
- longest non-upgrade streak
- percentage of rewards that improve equipment
- tool tier by account progression band

## Pity trigger candidate

Do not implement by default.

Evaluate a system like:

```text
after N consecutive non-improving cave rewards:
  next successful cave guarantees an affinity/tier outcome that improves at least one slot
```

Choose N only if simulation or live telemetry justifies it.

## Cave difficulty/reward relationship

Higher cave tier must raise:
- expected reward
- risk
- travel/strength requirement

But:
- one high-roll early victory must not leapfrog huge sections of progression

## Agent output

Always provide:
- reward matrix
- expected bonus gain
- useful reward percentage
- bad-luck distribution
- recommended change
