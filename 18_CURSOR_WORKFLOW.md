# 18 — Cursor Workflow

## Objective

Make Cursor effective by reducing context and limiting each task.

## Task size

Good Cursor task:
- one endpoint
- one migration
- one domain service
- one UI screen
- one balance simulation
- one bug class

Bad Cursor task:
> Build the entire game from these plans.

## Prompt structure for Cursor

Use:

```text
ROLE
You are implementing [specific Ashfall subsystem].

READ FIRST
[list 3–7 files]

TASK
[one coherent goal]

LOCKED RULES
[important invariants]

ACCEPTANCE CRITERIA
[testable bullets]

DO NOT
[scope exclusions]

VERIFY
[commands/tests]

REPORT
[required completion report]
```

## Agent handoff rule

Specialist agents do not rewrite unrelated systems.

Example:
- Economy Agent may propose `energy.node.baseYield`
- Combat Agent may not change it to solve troop balance
- Orchestrator resolves cross-system requests

## Change proposal format

Any balance change should say:

```text
Parameter:
Old:
New:
Reason:
Simulation:
Side effects:
Confidence:
Rollback trigger:
```

## Documentation rule

If code intentionally differs from the plan:
- do not silently leave the docs stale
- update the relevant plan
- note the decision and reason

## Context efficiency

Before a task:
1. identify subsystem
2. load matching agent file
3. load matching design file
4. load matching balance file if needed
5. inspect relevant code
6. work

Do not feed every Ashfall document into every Cursor prompt.
