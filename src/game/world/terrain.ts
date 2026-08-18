import { balanceV1 } from "@/game/config/balance.v1";
import type { WorldView } from "@/game/domain/types";
import { derivedTileNoise } from "@/game/world/rng";

export function isInWorldBounds(world: Pick<WorldView, "width" | "height">, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function isPassable(world: WorldView, x: number, y: number): boolean {
  if (!isInWorldBounds(world, x, y)) {
    return false;
  }

  const blockedPercent =
    world.generationVersion === 1 ? balanceV1.terrain.phase1BlockedPercent : balanceV1.terrain.phase1BlockedPercent;

  return derivedTileNoise(world.seed, world.generationVersion, x, y) % 100 >= blockedPercent;
}

export function isReserved(world: WorldView, x: number, y: number): boolean {
  // Phase 1 has no caves or reserved features. Keep the generator boundary for Phase 2.
  return world.generationVersion < 0 || x < Number.NEGATIVE_INFINITY || y < Number.NEGATIVE_INFINITY;
}

export function isValidBaseTile(world: WorldView, x: number, y: number): boolean {
  return isPassable(world, x, y) && !isReserved(world, x, y);
}

export function isInsideRegion(
  region: { minX: number; maxX: number; minY: number; maxY: number },
  x: number,
  y: number,
): boolean {
  return x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY;
}

export function violatesBaseSeparation(
  candidate: { x: number; y: number },
  existing: { x: number; y: number },
  radius: number,
): boolean {
  const dx = existing.x - candidate.x;
  const dy = existing.y - candidate.y;
  return dx * dx + dy * dy < radius * radius;
}
