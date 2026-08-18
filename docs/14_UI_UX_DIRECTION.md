# 14 — UI/UX Direction

## Product feel

Project Ashfall should look intentional and old-school rather than outdated by accident.

## Visual language

- dark charcoal/black structure
- rust, faded olive, industrial beige accents
- compact status panels
- crisp borders
- monospace/pixel-inspired secondary typography
- readable primary type
- small icons
- restrained glow
- subtle scanline/noise treatment only if readability remains strong

## Phase 1 screen hierarchy

### Landing
Primary:
- Project Ashfall title
- short premise
- Log In
- Create Account

### Register
1. title
2. email
3. password
4. confirm password
5. primary action
6. login link
7. errors

### Login
1. title
2. email
3. password
4. primary action
5. register link

### Game shell
1. base status
2. world
3. coordinate
4. Energy
5. Metal
6. logout

Do not build a fake full HUD before the grid exists.

## Future main game layout

Desktop concept:

```text
┌──────────────────────────────────────────────────────────────┐
│ PROJECT ASHFALL | ENERGY | METAL | TROOPS | COORDINATE     │
├───────────────┬──────────────────────────┬───────────────────┤
│ BASE / PLAYER │                          │ TILE / TARGET     │
│ STATUS        │        GRID MAP          │ DETAILS           │
│               │                          │                   │
├───────────────┴──────────────────────────┴───────────────────┤
│ EVENT LOG / COMMAND FEEDBACK                                │
└──────────────────────────────────────────────────────────────┘
```

## Movement UX

- arrow keys/WASD
- click/tap directional controls as fallback
- server response confirms movement
- blocked movement gives immediate reason
- keyboard repeat must be throttled to valid command cadence

## Feedback rules

A state-changing command should visibly communicate:
- request
- success/failure
- resource cost
- reward
- coordinate change
- cooldown if relevant

## Accessibility

- keyboard navigable
- sufficient contrast
- do not convey state with color alone
- focus states visible
- reduced-motion support
- grid tiles require accessible names/labels when interactive
