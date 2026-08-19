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
      metalCap: 2200,
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
        metalCostByFromLevel: {
          1: 80,
          2: 250,
          3: 650,
          4: 1600,
        },
        maxLevel: 5,
        extraEnergyPerHourPerLevel: 4,
        extraMetalPerHourPerLevel: 2,
      },
    },
    caves: {
      perThousandTiles: 5,
      collectChebyshevRange: 1,
      starterTier: 1,
      energyCostByTier: {
        1: 35,
      },
    },
    tools: {
      maxTier: 5,
      bonusBpsByTier: {
        1: 1000,
        2: 2200,
        3: 3800,
        4: 6000,
        5: 9000,
      },
    },
  },
  troops: {
    startingDefense: 2,
    startingOffense: 2,
    offenseAttack: 10,
    defenseDefense: 10,
    cavePowerPerTier: 10,
    maxPerType: 20,
    recruitMetalCost: {
      OFFENSE: 40,
      DEFENSE: 35,
    },
  },
} as const;

export type BalanceV1 = typeof balanceV1;
