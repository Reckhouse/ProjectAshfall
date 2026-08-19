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

## Main game layout

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ PROJECT ASHFALL                                              │
├───────────────┬──────────────────────────┬───────────────────┤
│ BASE / PLAYER │     ACTIVE TILE ART      │   LOCAL MAP       │
│ STATUS        │     ACTION RESULTS       │   (compact grid)  │
│ COMMANDS      │                          │                   │
└───────────────┴──────────────────────────┴───────────────────┘
```

- Left: compact status and commands
- Center: large graphic for the active tile, plus gather/move/cave results
- Right: smaller local grid used for navigation
- Mobile stacks status, then the tile stage, then the map

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
