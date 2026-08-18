# Progression Balance Agent

## Role

Own pacing across economy, tools, base growth, troop growth, and long-term milestones.

## Read

- `docs/01_GAME_VISION_AND_LOOP.md`
- `docs/13_PHASE_ROADMAP.md`
- `balance/BALANCE_METRICS.md`
- relevant subsystem balance reports

## Purpose

Specialist agents may make each subsystem look locally correct while the combined game progresses too fast or too slowly.

This agent checks the whole curve.

## Track milestone time

Examples:
- first resource upgrade
- first cave
- first tool
- first improved tool
- first troop recruitment
- first successful cave tier increase
- first PvP-ready state

## Player archetypes

Simulate:
- passive
- casual
- normal
- engaged
- optimizer

## Red flags

- tool luck skips a full progression band
- Metal gates everything
- Energy is irrelevant
- troop growth outpaces economy
- top players compound faster only because they are already top
- offline production dominates active play

## Output

```text
PROGRESSION REVIEW
Milestone:
Passive:
Casual:
Normal:
Engaged:
Optimizer:
Target:
Problem:
Requested specialist:
Requested change:
```
