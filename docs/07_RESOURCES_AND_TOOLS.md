# 07 — Resources and Tools

## Resource roles

### Energy
High-frequency operational resource.

Likely future uses:
- exploration
- movement
- scanning
- cave entry/operations
- base systems

### Metal
Scarcer progression resource.

Likely future uses:
- construction
- base upgrades
- troop recruitment
- troop upgrades

Do not create sinks until the mechanic that needs the sink exists.

## Resource sources

### Passive base production
Purpose:
- prevent soft lock
- keep return visits useful
- provide minimum account progression

Passive progression should be weaker than active play.

Storage upgrades raise Energy and Metal caps. Higher storage levels add larger capacity jumps than earlier ones.

## Resource accounting

### Active map collection
Purpose:
- reward exploration
- create valuable territory
- give tools immediate utility

## Resource accounting

Use integer units only.

Never accumulate floating-point resource values.

## Passive accrual model

Avoid a write every minute.

Store:

```text
stored_amount
last_accrued_at
production_rate
```

On relevant read/mutation:

```text
elapsed = now - last_accrued_at
earned = floor(elapsed * production_rate)
new_stored = min(cap, stored + earned)
```

Persist during meaningful state changes or controlled materialization.

## Tool purpose

Tools are cave rewards that improve resource collection.

Initial slots:

```text
ENERGY_TOOL
METAL_TOOL
```

This makes specialization obvious.

## Tool bonus calculation

Use basis points.

```text
finalYield =
  floor(baseYield * (10000 + bonusBps) / 10000)
```

## Draft tool tiers

| Tier | Label | Bonus |
|---|---|---:|
| 1 | Salvaged | +10% |
| 2 | Calibrated | +22% |
| 3 | Advanced | +38% |
| 4 | Prototype | +60% |
| 5 | Relic | +90% |

These are balance candidates.

## Tool rules

- reward generated server-side
- tool instance persisted before client receives it
- equipping is server-authorized
- tool bonus comes from authoritative config
- UI never invents tool stats
- lucky early drop helps but does not decide the account

## Duplicate protection

First preferred design:

- slightly favor the resource slot with the weaker equipped tool
- do not eliminate random duplicates entirely

If telemetry shows excessive duplicate frustration, add:
- salvage
- merge
- pity threshold

Do not implement all three immediately.

## Soft-lock rule

Before Energy becomes a movement cost, guarantee at least one recovery path:

- passive Energy
- emergency return
- zero-cost return corridor
- equivalent server-owned safety rule

A player must never be permanently stranded by a resource mistake.
