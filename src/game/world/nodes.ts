import { balanceV1 } from "@/game/config/balance.v1";
import type { FeatureType, ResourceKind, WorldView } from "@/game/domain/types";
import { chunkCoord } from "@/game/world/chunks";
import { derivedTileNoise } from "@/game/world/rng";
import { isPassable, isReserved } from "@/game/world/terrain";

export type NodeCandidate = {
  x: number;
  y: number;
  chunkX: number;
  chunkY: number;
  featureType: FeatureType;
  resourceType: ResourceKind;
  yield: number;
};

export function nodeCandidateAt(world: WorldView, x: number, y: number): NodeCandidate | null {
  if (!isPassable(world, x, y) || isReserved(world, x, y)) {
    return null;
  }

  const energyRoll = derivedTileNoise(world.seed, world.generationVersion, x, y + 4099) % 1000;
  const metalRoll = derivedTileNoise(world.seed, world.generationVersion, x + 4099, y) % 1000;
  const energyHit = energyRoll < balanceV1.economy.nodes.energyPerThousandTiles;
  const metalHit = metalRoll < balanceV1.economy.nodes.metalPerThousandTiles;

  if (!energyHit && !metalHit) {
    return null;
  }

  const resourceType: ResourceKind = energyHit ? "ENERGY" : "METAL";
  return {
    x,
    y,
    chunkX: chunkCoord(x),
    chunkY: chunkCoord(y),
    featureType: resourceType === "ENERGY" ? "ENERGY_NODE" : "METAL_NODE",
    resourceType,
    yield: resourceType === "ENERGY" ? balanceV1.economy.nodes.energyYield : balanceV1.economy.nodes.metalYield,
  };
}

export function candidatesInChunk(world: WorldView, chunkX: number, chunkY: number): NodeCandidate[] {
  const size = balanceV1.world.chunkSize;
  const originX = chunkX * size;
  const originY = chunkY * size;
  const found: NodeCandidate[] = [];
  for (let localY = 0; localY < size; localY += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const candidate = nodeCandidateAt(world, originX + localX, originY + localY);
      if (candidate) {
        found.push(candidate);
      }
    }
  }
  return found;
}

export function chebyshevDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function productionRates(baseLevel: number): { energyPerHour: number; metalPerHour: number } {
  const extraLevels = Math.max(0, baseLevel - 1);
  return {
    energyPerHour:
      balanceV1.economy.passive.energyPerHour + extraLevels * balanceV1.economy.upgrades.base.extraEnergyPerHourPerLevel,
    metalPerHour:
      balanceV1.economy.passive.metalPerHour + extraLevels * balanceV1.economy.upgrades.base.extraMetalPerHourPerLevel,
  };
}

export function accruedUnits(input: {
  lastAccruedAt: Date;
  perHour: number;
  current: number;
  cap: number;
  now: Date;
}): { earned: number; nextAccruedAt: Date } {
  if (input.perHour <= 0 || input.current >= input.cap) {
    return { earned: 0, nextAccruedAt: input.lastAccruedAt };
  }
  const elapsedMs = Math.max(0, input.now.getTime() - input.lastAccruedAt.getTime());
  const earned = Math.min(input.cap - input.current, Math.floor((elapsedMs * input.perHour) / 3_600_000));
  if (earned <= 0) {
    return { earned: 0, nextAccruedAt: input.lastAccruedAt };
  }
  const consumedMs = Math.floor((earned * 3_600_000) / input.perHour);
  return { earned, nextAccruedAt: new Date(input.lastAccruedAt.getTime() + consumedMs) };
}
