# 17 — Vercel + Neon Deployment Plan

## Environments

Maintain:

```text
local
preview
production
```

## Vercel

- connect source repository
- deploy Next.js application
- use preview deployments for branches/PRs
- keep secrets in environment variables
- use Node.js runtime for game commands requiring full database/runtime support

## Neon

Recommended:
- primary production database branch
- development database/branch
- preview database branches when practical
- pooled connection for serverless traffic

## Authentication

Use Neon Auth in the same overall Neon-backed environment.

Keep auth checks close to:
- protected page data
- route handlers
- server mutations

Do not assume protecting a page visually protects its APIs.

## Required environment validation

Fail application startup/build where appropriate if required config is absent.

Examples:
```text
DATABASE_URL
auth-specific Neon variables
APP_ORIGIN / trusted origin variables if required
```

Never commit values.

## Migration workflow

1. change Drizzle schema
2. generate migration
3. review SQL
4. apply to development
5. run tests
6. test against preview branch
7. deploy application
8. apply/release production migration under controlled workflow

## Rollback thinking

For each migration:
- can old application read new schema?
- can new application run if migration is delayed?
- is migration destructive?
- is a data backfill required?

Prefer additive migrations.

## Platform notes

Current platform guidance favors:
- Next.js App Router Route Handlers for backend endpoints
- explicit authentication/authorization in Route Handlers and server mutations
- Node.js runtime where Postgres/domain dependencies need normal Node compatibility
- Neon pooled/serverless database connectivity for Vercel-style bursty traffic
