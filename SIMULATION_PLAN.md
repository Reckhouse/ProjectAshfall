# Balance Simulation Plan

## Purpose

Use Python to answer balance questions before changing production values.

## Proposed folder in implementation repo

```text
scripts/balance/
├── common.py
├── economy_sim.py
├── spawn_sim.py
├── cave_loot_sim.py
├── combat_sim.py
├── progression_sim.py
├── report.py
└── outputs/
```

## Simulation standards

Every script supports:
- explicit seed
- configurable iteration count
- balance-version input
- machine-readable result
- human-readable summary

## Command examples

Conceptual:

```bash
python scripts/balance/spawn_sim.py --seed 42 --players 10000
python scripts/balance/economy_sim.py --seed 42 --days 30 --players 50000
python scripts/balance/cave_loot_sim.py --seed 42 --players 100000
python scripts/balance/combat_sim.py --seed 42 --fights 500000
```

## Output formats

Required:
- JSON summary

Helpful:
- CSV detail
- Markdown report
- PNG plots

Plots are supporting evidence, not the only output.

## Statistical reporting

At minimum:
- count
- mean
- median
- p5
- p25
- p75
- p95
- min
- max

For binary outcomes:
- rate
- sample size

## Extreme-case capture

Whenever simulation encounters a suspicious outlier, store:
- seed
- player/world parameters
- balance version
- event sequence

This creates reproducible balance bugs.

## CI use

Fast smoke simulation:
- small iteration count
- detects math/regression failure

Deep simulations:
- run manually or scheduled outside normal game request path

## Golden rule

Do not tune by changing multiple unrelated variables at once.

Change one hypothesis, rerun, compare.
