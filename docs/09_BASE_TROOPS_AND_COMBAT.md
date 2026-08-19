# 09 — Base, Troops, and Combat

## Military identity

Ashfall's military model begins with a simple split:

### Defense troops
- remain at base
- optimized for defending
- receive base defensive modifiers

### Offense troops
- accompany player/expedition
- used for caves and future attacks
- unavailable to defend the base while deployed

## Strategic rule

A player cannot use the same troop simultaneously for offense and defense.

This must be enforced in persisted state, not inferred in UI.

## Leaving base

1. Player selects number of available offense troops.
2. Server validates ownership and quantity.
3. Server creates expedition.
4. Troops move from base availability to expedition assignment.
5. Player state becomes `ACTIVE_IN_FIELD`.

## Returning home

1. Server verifies expedition is at/allowed to return.
2. Surviving troops are reassigned to base.
3. Expedition closes.
4. Player state becomes `ACTIVE_AT_BASE`.

## Initial troop-class scope

First combat version should use only two conceptual classes:
- Defense
- Offense

Avoid launching a large unit roster before core combat is balanced.

## Combat principles

- server authoritative
- deterministic when supplied a test seed
- bounded randomness
- readable battle report
- casualties cannot exceed committed troops
- no negative stacks
- single transaction for outcome

## Draft power model

```text
attackPower =
  offenseQuantity
  * offenseAttack
  * attackerModifiers
  * attackVariance

defensePower =
  defenseQuantity
  * defenseDefense
  * baseDefenseModifier
  * defenseVariance
```

Suggested random band:

```text
0.85 .. 1.15
```

This keeps planning important. Ties resolve as defender wins.

## Cave PvE

Cave defense power is `tier * cavePowerPerTier` with bounded variance. A starting expedition of 2 offense is expected to beat a T1 cave. Defeat spends Energy, applies casualties, and leaves the cave uncleared.

## Base defensive advantage target

For equal-cost forces:

```text
target defender win rate = 55% to 60%
```

This is a simulation target, not a hard-coded result.

## PvP protection recommendations

Before PvP release:
- new-player protection
- capped raid loss
- base cannot be permanently erased by one defeat
- repeat-target anti-farming rules
- attacker risk/cost

Phase 7 implements:
- 72-hour new-player protection
- 8-hour repeat-target cooldown
- loot limited to 12% of the current stockpile and a hard Energy/Metal cap
- raids require an adjacent field expedition and cost Energy
- empty garrisons still fight with a minimum base watch


## Snowball restrictions

Avoid:
- full resource wipe
- full troop wipe as normal outcome
- infinite attacks on one weak player
- rewards that make strongest player gain fastest forever

## Combat release gate

Do not ship PvP until the combat balance agent can demonstrate:

- expected win-rate curves
- casualty distributions
- defender-advantage target
- no impossible recovery state
- acceptable repeated-raid outcomes
