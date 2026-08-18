# Project Ashfall Ver 2.0 — Cursor Planning Package

This package is the implementation blueprint for **Project Ashfall Ver 2.0**, a persistent grid-based browser strategy game hosted on Vercel.

## Locked requirements

- Persistent square-grid world
- Old-school browser-game presentation
- Two launch resources:
  - **Energy**
  - **Metal**
- Each account receives one randomly placed base
- Base coordinates are generated server-side
- Caves are distributed throughout the map
- Tools are recovered from caves
- Tools improve resource collection
- Defense troops remain at the base
- Offense troops travel with the player
- Phase 1 is limited to:
  - registration
  - login
  - logout
  - session handling
  - player provisioning
  - random valid base generation
  - protected game shell

## Recommended Ver 2.0 stack

- **Next.js App Router + TypeScript**
- **Vercel** for application hosting and server functions
- **Neon Postgres** through the Vercel/Neon integration
- **Neon Auth** for email/password account authentication
- **Drizzle ORM** for game-domain schema and queries
- **Zod** for server boundary validation
- **Vitest** for unit/integration tests
- **Playwright** for end-to-end browser flows
- **Python** for offline economy, spawn, loot, progression, and combat simulations

## Architectural principle

> The browser sends intent. The server decides the result.

The client never chooses authoritative coordinates, rewards, resource amounts, tool drops, troop casualties, or combat outcomes.

## Cursor reading order

Start with:

1. `CURSOR_START_HERE.md`
2. `docs/00_DECISIONS_AND_ASSUMPTIONS.md`
3. `docs/01_GAME_VISION_AND_LOOP.md`
4. `docs/03_TECHNICAL_ARCHITECTURE.md`
5. `docs/04_PHASE_1_AUTH_AND_BASE_SPAWN.md`
6. `docs/06_DATABASE_SCHEMA.md`
7. `task_packets/PHASE_1_TASKS.md`

For balancing work, read only the relevant balance file plus the matching balance agent.

## Package map

```text
Project_Ashfall_V2_Cursor_Plan/
├── README.md
├── CURSOR_START_HERE.md
├── MANIFEST.md
├── docs/
├── balance/
├── cursor_agents/
└── task_packets/
```

The package is intentionally split into small, focused documents so Cursor does not need to load the entire game specification for every task.
