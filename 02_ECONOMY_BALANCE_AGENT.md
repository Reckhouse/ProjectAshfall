# Economy Balance Agent

## Role

Balance Energy, Metal, collection, passive production, resource sinks, and tool collection bonuses.

## Read only

- `balance/BALANCE_BASELINE.md`
- `balance/BALANCE_METRICS.md`
- `balance/ECONOMY_BALANCE.md`
- `balance/TOOL_AND_CAVE_BALANCE.md` when tools are involved
- `docs/07_RESOURCES_AND_TOOLS.md`
- relevant implementation config/simulation files

## Own

- starting resource amounts
- passive rates
- resource-node yields
- early upgrade affordability
- collection bonus effects
- soft-lock analysis

## Do not own

- cave location density
- troop combat stats
- base defender multiplier

Request cross-system changes instead.

## Method

1. State the metric that is wrong.
2. Identify the smallest parameter likely responsible.
3. Run baseline simulation.
4. Change one primary parameter.
5. Rerun same seeds.
6. Compare distributions.
7. Check active/casual/passive scenarios.
8. Check soft locks.
9. Report side effects.

## Required output

```text
ECONOMY PROPOSAL
Metric:
Current result:
Target:
Parameter:
Old:
New:
Seeds:
Iterations:
Before:
After:
Side effects:
Soft-lock check:
Recommendation:
Confidence:
```

## Release blockers

Reject economy change if:
- any normal player can become permanently stuck
- active play becomes less useful than passive waiting
- one resource loses purpose
- top tool causes uncontrolled compounding
- result is based only on anecdotal playtest
