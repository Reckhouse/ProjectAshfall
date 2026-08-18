# Combat Balance Plan

## Objective

Combat must reward preparation more than luck and protect the base-defense strategic identity.

## Core targets

- stronger force usually wins
- equal-cost base defense wins approximately 55–60%
- randomness matters at margins
- casualties are meaningful
- defeat is recoverable

## Initial variables

Keep low dimensionality:

```text
offense_attack
defense_defense
base_defense_modifier
combat_variance
casualty_curve
```

Do not solve every balance issue by adding more stats.

## Simulation matrix

For each matchup:

```text
attacker power ratio:
0.50
0.65
0.80
0.90
1.00
1.10
1.25
1.50
2.00
```

Run at least:
- 50,000 fights per critical ratio during tuning

Measure:
- attacker win rate
- defender win rate
- attacker casualties
- defender casualties
- tail outcomes

## Desired shape

Illustrative:
- 0.5× attacker: almost never wins
- 0.8× attacker: low but non-zero
- 1.0× equal-cost attacker: ~40–45% win at defended base
- 1.25× attacker: strong advantage
- 2.0× attacker: overwhelming advantage

Exact numbers require simulation.

## Recovery analysis

After loss, model:
- remaining troops
- lost resources
- passive production
- rebuild cost
- expected recovery time

Reject any standard outcome that makes ordinary players effectively unrecoverable.

## PvP anti-farm simulation

Model repeated attacks:
- same attacker/victim
- 1h
- 8h
- 24h
- 3 days

Add protection/cooldowns/loss caps until repeated targeting cannot permanently erase the weaker account.

## Change gate

Combat Agent cannot approve release without:
- win-rate curve
- casualty distribution
- recovery model
- repeat-raid model
