# Spawn and World Balance Plan

## Objective

Random base generation must feel random without creating obviously unfair starting positions.

## Spawn fairness dimensions

- distance to nearest base
- distance to low-tier cave
- distance to Energy source
- distance to Metal source
- impassable terrain around base
- density of nearby objectives
- safe expansion options

## Hard spawn constraints

- valid terrain
- no collision
- minimum base spacing
- no cave directly under base
- no impossible enclosed position

## Soft fairness constraints

A valid spawn can still be unfair.

Score candidate neighborhood:

```text
energy_access_score
metal_access_score
t1_cave_access_score
mobility_score
crowding_score
```

Do not necessarily choose the highest score. Use a minimum acceptable fairness band, then choose randomly among acceptable candidates.

This preserves randomness.

## Suggested simulation

Generate at least:
- 100 worlds
- 10,000 spawn events

Measure:
- spawn retries
- nearest neighbor
- first Energy distance
- first Metal distance
- first T1 cave distance
- percentage of spawns outside acceptable fairness band

## Candidate target

Low-tier cave:
```text
median 10–25 tiles
p95 < 45 tiles
```

Resource access targets should be set once node generation is finalized.

## Density warning

Minimum base spacing alone can create poor late-region performance.

Spawn agent should:
- monitor region occupancy
- open new spawn regions before rejection rate spikes
- avoid unbounded random retries

## World-generation balance change gate

Any density or spacing change must include:
- old distribution
- new distribution
- spawn success rate
- fairness score distribution
- map heatmap or summary
