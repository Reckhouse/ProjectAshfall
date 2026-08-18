# Balance Agent Handoff Protocol

## Purpose

Prevent multiple Cursor agents from making contradictory balance changes.

## Ownership

### Economy Balance Agent
Owns:
- Energy/Metal sources
- sinks
- passive rates
- node yields
- tool collection multipliers

### World Generation Agent
Owns:
- feature densities
- spawn regions
- distance distributions
- spawn fairness

### Combat Balance Agent
Owns:
- troop combat stats
- defender modifier
- variance
- casualty model

### Progression Agent
Owns:
- milestone pacing across systems
- upgrade timing
- cross-system progression bands

## Cross-system change

If one agent needs another subsystem changed:

Do not edit it directly.

Write:

```text
CROSS-SYSTEM REQUEST

Requesting agent:
Target agent:
Metric problem:
Evidence:
Requested outcome:
Suggested parameter:
Do not exceed:
```

## Orchestrator decision

Orchestrator:
1. checks whether local solution exists
2. identifies conflicting metrics
3. authorizes one parameter set
4. updates baseline/version
5. assigns simulation rerun

## Balance version rule

A production balance change increments the balance version.

A pure display change does not.

## Required evidence

Every balance recommendation includes:
- hypothesis
- sample size
- seed(s)
- before
- after
- target metric
- side effects
- confidence
