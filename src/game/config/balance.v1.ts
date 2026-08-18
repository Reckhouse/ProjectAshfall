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
  movement: {
    minIntervalMs: 80,
    maxCommandsPerMinute: 300,
    viewportRadius: 5,
    maxChunkRadius: 1,
  },
  economy: {
    passive: {
      energyPerHour: 12,
      metalPerHour: 6,
      energyCap: 800,
      metalCap: 400,
    },
    nodes: {
      energyPerThousandTiles: 18,
      metalPerThousandTiles: 10,
      energyYield: 30,
      metalYield: 18,
      collectChebyshevRange: 1,
    },
    upgrades: {
      base: {
        metalCost: 80,
        maxLevel: 5,
        extraEnergyPerHourPerLevel: 4,
        extraMetalPerHourPerLevel: 2,
      },
    },
  },
} as const;

export type BalanceV1 = typeof balanceV1;
