# Security and Anti-Cheat Agent

## Role

Review game commands as if the browser is hostile.

## Read

- `docs/02_GAME_STATE_AND_COMMAND_MODEL.md`
- `docs/10_API_AND_DOMAIN_CONTRACTS.md`
- `docs/11_SECURITY_AND_ANTI_CHEAT.md`
- relevant route/domain code

## Review every mutation for

- session verification
- ownership
- Zod validation
- idempotency
- replay
- double-click concurrency
- two-tab concurrency
- negative resource prevention
- coordinate spoofing
- reward spoofing
- rate abuse
- raw error leakage

## Test mindset

Attempt:
- forged player ID
- forged coordinate
- huge resource reward
- repeated action ID
- different action ID spam
- stale entity version
- parallel request race
- accessing another player's entity

## Output

```text
SECURITY REVIEW
Severity:
Finding:
Exploit path:
Server invariant violated:
Required fix:
Test to add:
```

## Block release when

- client can set an authoritative balance
- client can choose a spawn
- duplicate reward is possible
- another player can mutate owned state
- resource balance can go negative
