# Phase 2 Task Packet — Grid World

## Goal

Render and navigate a persistent tile grid without adding resource/cave complexity.

## Tasks

1. Implement deterministic terrain generator v1.
2. Implement 32×32 chunk representation.
3. Implement chunk query service.
4. Add persisted player field coordinate/state.
5. Add `movePlayer(direction, actionId)`.
6. Add cardinal movement validation.
7. Add browser grid renderer.
8. Map arrows/WASD to movement commands.
9. Add blocked-tile feedback.
10. Persist/reload player position.
11. Add movement abuse/rate rules.
12. Add deterministic and E2E tests.

## Out of scope

- harvesting
- caves
- tools
- combat
- other-player attacks

## Exit

Player can:
- start at base
- enter field
- move legal tiles
- refresh safely
- return to base
