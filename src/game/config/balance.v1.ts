export const BALANCE_VERSION = 1 as const;

export const balanceV1 = {
  version: BALANCE_VERSION,
  startingResources: {
    energy: 250,
    metal: 150,
  },
  world: {
    slug: "ashfall-01",
    name: "Ashfall-01",
    initialWidth: 2048,
    initialHeight: 2048,
    chunkSize: 32,
    activeSpawnRegionSize: 512,
    generationVersion: 1,
  },
  spawn: {
    baseExclusionRadius: 12,
    attemptLimit: 40,
  },
  terrain: {
    phase1BlockedPercent: 8,
  },
} as const;

export type BalanceV1 = typeof balanceV1;
