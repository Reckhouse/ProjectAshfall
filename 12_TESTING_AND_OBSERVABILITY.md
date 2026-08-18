# 12 — Testing and Observability

## Testing pyramid

### Unit tests
Use for:
- balance math
- coordinate math
- distance
- terrain determinism
- tool bonus math
- combat pure functions

### Integration tests
Use for:
- provisioning
- transactions
- resource spending
- cave reward idempotency
- troop reassignment
- concurrency

### End-to-end tests
Use for:
- register/login/logout
- protected routes
- Phase 1 base visibility
- later map controls

## Phase 1 required tests

1. register new user
2. login existing user
3. unauthenticated `/game` blocked
4. provision creates one player
5. provision creates one base
6. repeated provision creates no duplicates
7. two concurrent base allocations cannot collide
8. base respects minimum spacing
9. starting Energy/Metal are fixed by server config
10. logout prevents protected access
11. login returns player to original base

## Deterministic test seeds

Every generated-system test should support a seed or injected RNG.

A failing simulation must be reproducible.

## Observability events

Start with structured server logs.

Suggested events:

```text
auth.register.success
auth.login.success
player.provision.started
player.provision.completed
player.provision.failed
base.spawn.retry
base.spawn.completed
game.command.rejected
game.command.completed
```

Future:
```text
resource.collected
cave.cleared
tool.awarded
expedition.started
combat.resolved
```

## Metrics worth tracking later

- registration completion
- provisioning failure rate
- spawn retry count
- median nearest-cave distance
- Energy/Metal earned per active hour
- time to first tool
- time to first troop upgrade
- cave success rate by tier
- tool upgrade usefulness rate
- PvP win rate by progression band
- resource concentration/Gini-like measures

## Release checks

Before each production deploy:

```text
typecheck
lint
unit tests
integration tests
build
critical Playwright smoke tests
migration validation
```

## Production debugging rule

A game action should be traceable using:
- request/action ID
- player ID
- command type
- server result
- balance version
