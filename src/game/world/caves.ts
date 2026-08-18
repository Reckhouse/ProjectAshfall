import { balanceV1 } from "@/game/config/balance.v1";
import type { ResourceKind, WorldView } from "@/game/domain/types";
import { chunkCoord } from "@/game/world/chunks";
import { chebyshevDistance, nodeCandidateAt } from "@/game/world/nodes";
import { derivedTileNoise } from "@/game/world/rng";
import { isPassable, isReserved } from "@/game/world/terrain";

export type CaveCandidate = {
  x: number;
  y: number;
  chunkX: number;
  chunkY: number;
  tier: number;
};

export function caveCandidateAt(world: WorldView, x: number, y: number): CaveCandidate | null {
  if (!isPassable(world, x, y) || isReserved(world, x, y) || nodeCandidateAt(world, x, y)) {
    return null;
  }
  const roll = derivedTileNoise(world.seed, world.generationVersion, x + 8191, y + 8191) % 1000;
  if (roll >= balanceV1.economy.caves.perThousandTiles) {
    return null;
  }
  return {
    x,
    y,
    chunkX: chunkCoord(x),
    chunkY: chunkCoord(y),
    tier: balanceV1.economy.caves.starterTier,
  };
}

export function caveCandidatesInChunk(world: WorldView, chunkX: number, chunkY: number): CaveCandidate[] {
  const size = balanceV1.world.chunkSize;
  const originX = chunkX * size;
  const originY = chunkY * size;
  const found: CaveCandidate[] = [];
  for (let localY = 0; localY < size; localY += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const candidate = caveCandidateAt(world, originX + localX, originY + localY);
      if (candidate) {
        found.push(candidate);
      }
    }
  }
  return found;
}

export function caveEnergyCost(tier: number): number {
  const costs = balanceV1.economy.caves.energyCostByTier;
  return costs[tier as keyof typeof costs] ?? costs[1];
}

export function pickToolAffinity(input: {
  energyTier: number;
  metalTier: number;
  roll: number;
}): ResourceKind {
  const energyWeight = input.metalTier < input.energyTier ? 35 : input.metalTier > input.energyTier ? 65 : 50;
  return input.roll < energyWeight ? "ENERGY" : "METAL";
}

export function pickGatherCave<T extends { id: string; x: number; y: number; cleared: boolean }>(
  cavesNearby: readonly T[],
  origin: { x: number; y: number },
  range: number,
): T | null {
  const inRange = cavesNearby.filter(
    (cave) => !cave.cleared && chebyshevDistance(origin, cave) <= range,
  );
  inRange.sort((left, right) => {
    const distanceDelta = chebyshevDistance(origin, left) - chebyshevDistance(origin, right);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }
    return left.id.localeCompare(right.id);
  });
  return inRange[0] ?? null;
}
