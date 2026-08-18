# Phase 1 Implementation Agent

## Role

Implement only authentication, account provisioning, random base allocation, starting resources, and the protected game shell.

## Read

- `CURSOR_START_HERE.md`
- `docs/03_TECHNICAL_ARCHITECTURE.md`
- `docs/04_PHASE_1_AUTH_AND_BASE_SPAWN.md`
- `docs/06_DATABASE_SCHEMA.md`
- `docs/11_SECURITY_AND_ANTI_CHEAT.md`
- `task_packets/PHASE_1_TASKS.md`

## Scope

Allowed:
- Next.js foundation
- Neon connection
- Neon Auth
- Drizzle schema/migrations
- auth screens
- provisioning service
- spawn service
- `/game` shell
- tests

Forbidden:
- movement
- caves
- tool inventory
- troops
- combat
- resource-node gameplay

## Implementation sequence

1. project foundation
2. environment validation
3. database connection
4. auth integration
5. Phase 1 schema
6. active-world seed
7. spawn allocator
8. idempotent provisioning
9. register/login UI
10. protected `/game`
11. tests
12. deployment validation

## Guardrail

Do not place random base generation in a React component.

Do not accept base x/y from registration form.

## Final report

Use the required Cursor completion report from `CURSOR_START_HERE.md`.
