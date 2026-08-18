# Phase 0 Task Packet — Foundation

## P0-01 Create application

Goal:
- initialize Next.js App Router + TypeScript project
- strict TypeScript
- Tailwind
- standard lint/build scripts

Acceptance:
- local dev runs
- production build passes

## P0-02 Connect Neon

Goal:
- configure database client
- environment validation
- test query

Acceptance:
- server can query Neon
- no database secret sent to client bundle

## P0-03 Add Drizzle

Goal:
- schema folder
- migration workflow
- migration scripts

Acceptance:
- empty/initial migration works locally

## P0-04 Add Neon Auth

Goal:
- email/password auth foundation
- session helpers
- route protection utilities

Acceptance:
- basic test user can register/login

## P0-05 Testing

Goal:
- Vitest
- Playwright
- test database strategy

Acceptance:
- sample unit test
- sample E2E test
- CI-compatible commands
