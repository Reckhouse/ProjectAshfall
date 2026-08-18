# 15 — Performance and Scaling

## Phase 1 principle

Do not optimize for imaginary millions of players.

Do design the schema so ordinary scaling is possible.

## Vercel function strategy

Use Node.js server functions for:
- auth-aware game commands
- Postgres transactions
- domain logic

Keep command handlers short.

Long offline balance simulations do not run inside player requests.

## Database connection strategy

Use Neon serverless-compatible/pooler configuration appropriate for Vercel.

Avoid opening uncontrolled long-lived database connection pools inside serverless functions.

## Query rules

### Coordinate features
Use indexed chunk/coordinate lookups.

### Nearby bases
Use bounded query windows.

### Player snapshot
Fetch only required entities.

Avoid N+1 query patterns in map rendering.

## World scaling

Chunking allows:
- small viewport fetches
- deterministic terrain regeneration
- materialized mutable features only
- cacheable world data

## Caching

Safe candidates:
- immutable balance config
- terrain encodings by world generation version
- static game content

Do not cache:
- private resource balances without player-aware invalidation
- mutable troop state indiscriminately
- auth/session decisions in unsafe global caches

## Realtime

Do not add realtime transport in Phase 1.

If later required for:
- presence
- live PvP
- chat
- event feed

introduce it behind a service interface. Persistent truth remains Postgres.

## Background work

Avoid periodic per-player jobs for passive resource ticks.

Use timestamp materialization instead.

For later scheduled world tasks:
- use coarse scheduled jobs
- update batches
- keep operations idempotent

## Scaling warning signs

Only consider service splitting when measured:
- command latency becomes unacceptable
- DB write contention appears
- map queries dominate
- combat processing is expensive
- realtime connection architecture becomes central
