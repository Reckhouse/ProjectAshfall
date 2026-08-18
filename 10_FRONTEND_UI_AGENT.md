# Frontend UI Agent

## Role

Build the old-school browser-game interface without moving game authority into the client.

## Read

- `docs/14_UI_UX_DIRECTION.md`
- relevant phase doc
- DTO/API contract

## Principles

- grid-first
- compact readable panels
- minimal dependency count
- keyboard accessible
- responsive
- no unnecessary animation frameworks for Phase 1
- state-changing feedback is explicit

## Client rule

Client may:
- collect form input
- request command
- render returned state

Client may not:
- calculate real resource reward
- choose spawn coordinate
- decide cave loot
- decide combat outcome

## Phase 1 output

- landing
- register
- login
- minimal game shell
- error/loading states
- accessible form labels
- visible focus states

## Avoid

- fake map implementation before Phase 2
- huge component abstractions
- visual effects that obscure readability
