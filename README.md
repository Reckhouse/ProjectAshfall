# Project Ashfall Ver 2.0

Persistent grid-based browser strategy game built on a server-authoritative command model. Phases 1–10 are implemented: auth, world grid, resources, caves/tools, troops, PvE/PvP combat, storage raids, standings, alliances, and commander mail.

## Gameplay loop

A commander can register, spawn into world `ashfall-01`, gather Energy and Metal, upgrade base/storage, clear tiered caves for stackable tools, recruit troops, raid other bases, join alliances, and send mail. The browser sends **intent only** (`actionId` + command parameters). The server decides outcomes — coordinates, resources, combat, and loot are never accepted from the client.

Starting stockpile: **250 Energy**, **150 Metal**, **2 offense / 2 defense** at base.

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

## Vercel + Neon deployment

1. Create a Neon project and a Vercel project from this repository.
2. Add the Neon integration (or paste the **pooled** connection string).
3. Set environment variables for **Production** and **Preview**:

```text
DATABASE_URL=postgres://...@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
AUTH_SECRET=<at least 32 random characters>
APP_ORIGIN=https://<your-deployment-host>
ADMIN_EMAILS=you@example.com
```

Optional — only if you use an **external** cron service (see Bot activity below):

```text
CRON_SECRET=<at least 16 random characters>
```

4. Deploy. The first server request applies schema migrations (`IF NOT EXISTS`) and seeds `ashfall-01` plus the active spawn region.

### Bot activity (Hobby tier)

Vercel **Hobby** plans cannot use Vercel Cron. This project does **not** ship a `vercel.json` cron schedule so Hobby deploys succeed.

Bots still run via **activity wake**:

- Loading `/game` ticks due bots in the background (respecting a 20s minimum interval per bot)
- Visiting `/admin` or calling admin stats does the same
- Admins can manually tick from the Admin panel

For hands-off scheduling on any plan, ping `GET /api/cron/bots` from an external scheduler (e.g. [cron-job.org](https://cron-job.org)) with header `Authorization: Bearer <CRON_SECRET>`. Vercel **Pro** teams may alternatively add a `crons` block back to `vercel.json` if desired.

Optional explicit migrate:

```bash
npm run db:migrate
```

`WORLD_SEED` is server-only and is never returned to the browser.

## Project layout

- `docs/` — architecture and design
- `balance/` — simulation baselines and tuning notes
- `cursor_agents/` — specialist agent briefs
- `task_packets/` — phase task lists
- `src/game/` — authoritative game logic and balance config
- `tests/` — Vitest service/security tests
- `e2e/` — Playwright smoke tests (phases 1–10)

Implementation notes: `docs/19_PHASE_1_IMPLEMENTATION_NOTES.md`. Start here for agent workflow: `CURSOR_START_HERE.md`.
