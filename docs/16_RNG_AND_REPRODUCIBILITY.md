# 16 — RNG and Reproducibility

## Why RNG needs architecture

Ashfall uses randomness for:
- base spawn candidates
- terrain/features
- cave locations
- tool rewards
- combat variance

Unstructured randomness makes bugs and balance failures impossible to reproduce.

## RNG categories

### Deterministic world RNG
Input:
- world seed
- generation version
- coordinate/chunk

Output:
- terrain
- feature candidate decisions

Same inputs must always produce same result.

### Transactional reward RNG
Used for:
- tool tier
- tool affinity
- future loot

Rules:
- generated server-side
- result persisted
- action idempotent
- reward table version stored

### Combat RNG
- bounded
- supplied seed supported in tests
- production seed generated server-side
- outcome persisted

## Seed derivation concept

Do not use raw concatenation with weak hashes.

Conceptual:

```text
derivedSeed =
  HMAC(serverWorldSecret,
       worldId + generationVersion + chunkX + chunkY + featureNamespace)
```

Use a cryptographically sound keyed derivation if seed secrecy matters.

## Never use

```text
Math.random()
```

for persistent world layout that must remain stable.

It is acceptable for purely cosmetic client animation.

## Reproducible bug report

A generated-system failure should be recordable as:

```text
world = ashfall-01
generationVersion = 1
balanceVersion = 3
chunk = 12,8
actionId = ...
rngCase = test/replay reference
```

## Balance simulation

Python simulations always print/store the seed used.

If a run finds an extreme result, the agent must be able to replay it.
