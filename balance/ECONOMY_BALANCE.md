# Economy Balance Plan

## Objective

Make Energy and Metal both valuable without creating constant starvation.

## Energy identity

Energy should be:
- earned more often
- spent more often
- the operational limiter

## Metal identity

Metal should be:
- rarer
- saved for meaningful progression
- more tied to construction/troops

## Source/sink matrix

| Resource | Early sources | Future sinks |
|---|---|---|
| Energy | passive, nodes | movement, scanning, operations |
| Metal | passive, nodes | upgrades, troops, structures |

Do not add a sink without a gameplay decision attached to it.

## Simulation questions

1. Can a new account make progress without leaving base?
2. How much faster is active play?
3. Can the player strand themselves if movement costs Energy?
4. Does one resource become useless?
5. Does a tool cause runaway compounding?
6. How long to afford first upgrade?
7. What happens after 24h/72h inactivity?

## Required Python scenarios

### Scenario A — passive-only
Simulate:
- 1 hour
- 8 hours
- 24 hours
- 72 hours

### Scenario B — casual active
- 15 min/day
- 30 min/day

### Scenario C — engaged
- 1–2 hours/day

### Scenario D — extreme optimizer
Assume near-perfect collection route.

## Outputs

For each scenario:
- Energy earned
- Metal earned
- resources spent
- stockpile
- progression milestone times
- active/passive ratio

## Tool multiplier stress test

For every tool tier, compare:
- no tool
- correct resource tool
- best plausible combined modifier

Flag:
- >2× unexpected acceleration
- resource stockpile grows without meaningful sink
- higher tool makes all lower nodes irrelevant

## Economy change gate

Agent may recommend value change only with:
- before/after table
- at least 10k simulated account-days or equivalent
- identified target metric
- no new soft lock
