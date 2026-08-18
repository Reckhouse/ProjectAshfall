# Project Ashfall Ver 2.0

Persistent grid-based browser strategy game. Phase 1 is live in this repo: register, log in, receive one server-chosen base, and see starting Energy and Metal.

## Locked Phase 1 slice

A commander can:

1. Create an account
2. Receive a session
3. Be provisioned into world `ashfall-01`
4. Receive one valid random base
5. See Energy **250** and Metal **150**
6. Log out, log back in, and return to the same coordinates

The browser sends intent. The server decides the result. Spawn coordinates and resource totals are never accepted from the client.

## Stack

- Next.js App Router + TypeScript
- Vercel (Node.js runtime)
- Neon Postgres through `@neondatabase/serverless`
- Drizzle ORM
- Zod
- Vitest + Playwright
- PGlite for local/CI tests

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Without a Neon URL, the app uses PGlite at `.data/ashfall.db`.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

End-to-end:

```bash
npx playwright install chromium
npm run test:e2e
```

## Vercel + Neon

1. Create a Neon project and a Vercel project from this repository.
2. Add the Neon integration (or paste the **pooled** connection string).
3. Set environment variables for Production and Preview:

```text
DATABASE_URL=postgres://...@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=<at least 32 random characters>
APP_ORIGIN=https://<your-deployment-host>
```

4. Deploy. The first server request applies the Phase 1 schema (`IF NOT EXISTS`) and seeds `ashfall-01` plus one 512×512 spawn region.

Optional explicit migrate:

```bash
npm run db:migrate
```

`WORLD_SEED` is server-only and is never returned to the browser.

## Plan files

Planning documents now live in the layout the Cursor package described:

- `docs/` architecture and design
- `balance/` simulation and numeric baselines
- `cursor_agents/` specialist agent briefs
- `task_packets/` phase task lists
- `CURSOR_START_HERE.md` working rules

Phase 1 implementation notes: `docs/19_PHASE_1_IMPLEMENTATION_NOTES.md`.
