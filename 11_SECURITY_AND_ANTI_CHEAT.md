# 11 — Security and Anti-Cheat

## Security premise

Every browser request is untrusted.

A player can:
- edit JavaScript
- call APIs directly
- modify requests
- replay requests
- run multiple tabs
- automate commands

Build accordingly.

## Authentication

For every protected route/command:
1. verify session server-side
2. derive auth user ID from session
3. derive game player from auth user
4. verify player status
5. verify ownership/permission

## Never trust client values for

- player ID authority
- base coordinate
- current coordinate
- resource balances
- collection reward
- tool stats
- cave reward
- troop counts
- combat power
- cooldown completion
- timestamps

## Idempotency

Every expensive mutation should accept an `actionId`.

Store `(player_id, action_id)` unique.

On duplicate:
- return prior safe result, or
- return stable replay response

Do not perform mutation twice.

## Rate limits

Add rate rules by command category.

Examples:
- auth attempts
- provisioning
- movement
- resource collection
- cave actions
- combat actions

The exact limits should reflect normal human interaction and be tunable.

## Authorization examples

### Move
Must verify:
- player is in field state
- direction valid
- no blocking state
- enough Energy if movement has cost

### Cave
Must verify:
- cave exists
- player is at valid location
- cave is claimable by player
- action not replayed

### Tool equip
Must verify:
- tool belongs to player
- slot matches rule

## Database protections

Use:
- constraints
- checks
- unique indexes
- transactions
- atomic update conditions

Application validation alone is insufficient.

## Randomness security

Do not expose reusable secret RNG material.

For persistent public fairness:
- world seed may remain server-only
- reward results are persisted
- optional future commitment/reveal can be added for competitive verification

## Logging

Log:
- action ID
- player ID
- command type
- target entity ID
- success/error code
- latency
- relevant balance version

Do not log:
- plaintext passwords
- session tokens
- auth cookies
- full database URL

## Abuse detection future signals

- impossible action rate
- repeated blocked movement
- repeated duplicate claims
- command timing far faster than UI supports
- multi-account patterns
- suspicious resource growth deltas

Detection does not replace authoritative rules.
