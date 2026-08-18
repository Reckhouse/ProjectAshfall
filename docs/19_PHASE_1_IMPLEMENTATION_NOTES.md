# Phase 1 Implementation Notes

## Hosting

- Application: Next.js on **Vercel** (Node.js runtime for game/auth routes)
- Database: **Neon Postgres**, via the Vercel/Neon integration
- Local/CI tests: PGlite so the suite does not require a live Neon branch

## Authentication (documented plan deviation)

The planning package specifies Neon Auth. Phase 1 ships a first-party email/password adapter stored in the same Neon database:

- `auth_users` / `auth_sessions`
- scrypt password hashes
- httpOnly `ashfall_session` cookie
- game tables key only off `auth_user_id`

This keeps identity out of game-rule tables and allows a later swap to Neon Auth without changing spawn, resources, or player provisioning. Passwords are never stored in plaintext and never returned to the browser.

## Neon connection

`getDb()` uses `@neondatabase/serverless` `Pool` (WebSocket) so provisioning can run in a transaction. Use the **pooled** Neon connection string in Vercel:

```text
DATABASE_URL=postgres://...@ep-....-pooler.region.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=<32+ random characters>
APP_ORIGIN=https://<your-vercel-domain>
```

On first connection the Phase 1 schema (`IF NOT EXISTS`) is applied and world `ashfall-01` is seeded idempotently.

## What Phase 1 does not include

Movement, resource nodes, caves, tools, troops, and combat remain out of scope.
