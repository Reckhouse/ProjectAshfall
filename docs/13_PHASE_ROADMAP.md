# 13 — Development Roadmap

## Phase 0 — Project foundation

Deliver:
- Next.js project
- TypeScript strict mode
- Tailwind
- Neon connection
- Drizzle
- Neon Auth
- migrations
- Vitest
- Playwright
- environment validation
- CI/build checks

Exit:
- deployable blank app
- database connection verified
- auth provider configured

## Phase 1 — Authentication + random base

Deliver:
- register
- login
- logout
- protected `/game`
- player provisioning
- active world
- spawn region
- random valid base
- starting Energy/Metal
- minimal game shell

Exit:
- full Phase 1 acceptance suite passes

## Phase 2 — Grid world renderer

Deliver:
- visible tile grid
- chunk loading
- deterministic terrain
- player/base marker
- keyboard/tap navigation UI
- server movement command
- no caves/resources yet unless needed for renderer test

Exit:
- player can move safely across legal tiles
- refresh returns correct persisted location

## Phase 3 — Energy + Metal collection

Deliver:
- resource node generation
- resource node state
- collection action
- passive base income
- first resource sinks/upgrades
- economy telemetry

Exit:
- economy simulation and live test show no soft lock

## Phase 4 — Caves + tools

Deliver:
- cave distribution
- cave discovery
- simple cave challenge
- tool reward
- Energy/Metal tool slots
- tool bonuses
- loot telemetry

Exit:
- time-to-first-tool and duplicate rates inside targets

## Phase 5 — Troops + expeditions

Deliver:
- defense troops
- offense troops
- recruitment
- troop split
- leave/return base
- cave combat can now use offense strength

Exit:
- troop assignment invariants are safe under concurrency

## Phase 6 — PvE combat

Deliver:
- deterministic/bounded combat engine
- casualty model
- battle reports
- cave tiers fully use troop combat

Exit:
- combat simulation targets pass

## Phase 7 — PvP raids

Deliver:
- base visibility rules
- attacks
- defender advantage
- new-player protection
- raid losses
- anti-farming rules
- battle reports

Exit:
- no catastrophic snowball/recovery failures in simulation

## Phase 8 — Social/competitive systems

Possible:
- leaderboards
- rankings
- alliances
- events
- seasons
- messaging

Only add after the core economy and PvP are stable.
