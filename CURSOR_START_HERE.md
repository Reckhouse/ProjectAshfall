# Cursor Start Here

## Mission

Build Project Ashfall Ver 2.0 incrementally, keeping game rules authoritative, deterministic where fairness matters, and easy to rebalance.

## Mandatory working rules

1. Inspect existing code before editing it.
2. Read only the planning files relevant to the current task.
3. Do not implement future phases while completing the current phase.
4. One coherent feature or migration per task.
5. Every state-changing game action is authorized and validated server-side.
6. Do not trust resource totals, positions, rewards, timers, troop counts, or combat outcomes sent by the browser.
7. Use database transactions for multi-entity state changes.
8. Use idempotency keys for game commands that may be retried.
9. Use seeded or server-owned randomness for persistent/fairness-sensitive systems.
10. Keep tunable game numbers in centralized versioned balance configuration.
11. Add tests whenever a rule changes.
12. Do not silently rewrite a locked game rule.
13. Do not use destructive database changes without a migration plan.
14. Prefer the simplest reversible architecture until a measured problem requires more infrastructure.

## Context loading

### Phase 1
Read:
- `docs/00_DECISIONS_AND_ASSUMPTIONS.md`
- `docs/03_TECHNICAL_ARCHITECTURE.md`
- `docs/04_PHASE_1_AUTH_AND_BASE_SPAWN.md`
- `docs/06_DATABASE_SCHEMA.md`
- `docs/11_SECURITY_AND_ANTI_CHEAT.md`
- `docs/12_TESTING_AND_OBSERVABILITY.md`
- `task_packets/PHASE_1_TASKS.md`
- `cursor_agents/09_PHASE_1_IMPLEMENTATION_AGENT.md`

### World generation
Read:
- `docs/05_WORLD_GRID_AND_GENERATION.md`
- `docs/16_RNG_AND_REPRODUCIBILITY.md`
- `balance/SPAWN_AND_WORLD_BALANCE.md`
- `cursor_agents/04_WORLD_GENERATION_AGENT.md`

### Economy and tools
Read:
- `docs/07_RESOURCES_AND_TOOLS.md`
- `balance/BALANCE_BASELINE.md`
- `balance/ECONOMY_BALANCE.md`
- `balance/TOOL_AND_CAVE_BALANCE.md`
- `cursor_agents/02_ECONOMY_BALANCE_AGENT.md`

### Troops/combat
Read:
- `docs/09_BASE_TROOPS_AND_COMBAT.md`
- `balance/COMBAT_BALANCE.md`
- `cursor_agents/03_COMBAT_BALANCE_AGENT.md`

## Definition of done

A Cursor task is complete only when:

- project builds
- type checking passes
- lint passes
- affected tests pass
- new failure paths have tests
- migrations are created when schema changes
- no secret is committed
- browser cannot bypass the domain rule
- acceptance criteria in the task packet pass
- documentation is updated if implementation intentionally differs from plan

## Required Cursor completion report

Return:

1. **Files changed**
2. **Implementation summary**
3. **Tests added or changed**
4. **Commands run**
5. **Known risks**
6. **Plan deviations**
7. **Recommended next task**

## Stop conditions

Stop and explain before continuing when:

- a request conflicts with a locked requirement
- a migration risks destructive production data loss
- a solution requires client-authoritative game state
- authorization would be bypassed
- a missing balance value would materially determine progression
- a generation algorithm change would mutate an existing world's terrain without a version/migration strategy

For small reversible details, choose a sensible implementation and document it instead of expanding the task.
