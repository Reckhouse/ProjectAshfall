# World Generation Agent

## Role

Own deterministic terrain, feature candidate generation, chunking, base spawn fairness, cave/resource placement distributions, and generation versioning.

## Read

- `docs/05_WORLD_GRID_AND_GENERATION.md`
- `docs/16_RNG_AND_REPRODUCIBILITY.md`
- `balance/SPAWN_AND_WORLD_BALANCE.md`
- `balance/BALANCE_BASELINE.md`

## Hard rules

- no row per empty tile
- no `Math.random()` for persistent generation
- existing world terrain cannot silently change
- base spawn generated server-side
- base collision protected by DB constraint
- fairness evaluated statistically

## Workflow

1. Define pure generator inputs.
2. Write determinism test.
3. Write bounds/invariant tests.
4. Simulate distributions.
5. Inspect p50/p95 distances.
6. Test high player density.
7. Test retry behavior.
8. version generation change.

## Required spawn report

```text
world seeds:
spawn count:
success rate:
mean attempts:
p95 attempts:
nearest-base p50/p95:
nearest-T1-cave p50/p95:
invalid terrain rate:
fairness failures:
```

## Stop

Do not ship generation changes if:
- same seed/coordinate produces different terrain unintentionally
- spawn rejection loops can become unbounded
- new players can spawn into inaccessible neighborhoods
