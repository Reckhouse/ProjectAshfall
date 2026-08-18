import { balanceV1 } from "@/game/config/balance.v1";
import type { TerrainKind, WorldView } from "@/game/domain/types";
import { derivedTileNoise } from "@/game/world/rng";
import { isInWorldBounds, isPassable } from "@/game/world/terrain";

export const TERRAIN_KIND_CODES = {
  plains: 0,
  ash: 1,
  rock: 2,
  ruin: 3,
} as const;

export function chunkCoord(value: number, chunkSize = balanceV1.world.chunkSize): number {
  return Math.floor(value / chunkSize);
}

export function chunkOrigin(chunk: number, chunkSize = balanceV1.world.chunkSize): number {
  return chunk * chunkSize;
}

export function terrainKind(world: WorldView, x: number, y: number): TerrainKind {
  if (!isInWorldBounds(world, x, y) || !isPassable(world, x, y)) {
    return derivedTileNoise(world.seed, world.generationVersion, x, y) % 2 === 0 ? "rock" : "ruin";
  }
  return derivedTileNoise(world.seed, world.generationVersion, x + 17, y + 31) % 2 === 0 ? "plains" : "ash";
}

export const TERRAIN_KIND_BY_CODE: TerrainKind[] = ["plains", "ash", "rock", "ruin"];

export function decodeTerrainKind(code: number): TerrainKind {
  return TERRAIN_KIND_BY_CODE[code] ?? "rock";
}

export function encodeTerrainKind(kind: TerrainKind): number {
  return TERRAIN_KIND_CODES[kind];
}

export function materializeChunk(world: WorldView, chunkX: number, chunkY: number): {
  chunkX: number;
  chunkY: number;
  size: number;
  originX: number;
  originY: number;
  terrain: number[];
} {
  const size = balanceV1.world.chunkSize;
  const originX = chunkOrigin(chunkX, size);
  const originY = chunkOrigin(chunkY, size);
  const terrain: number[] = new Array(size * size);
  for (let localY = 0; localY < size; localY += 1) {
    for (let localX = 0; localX < size; localX += 1) {
      const x = originX + localX;
      const y = originY + localY;
      terrain[localY * size + localX] = encodeTerrainKind(terrainKind(world, x, y));
    }
  }
  return { chunkX, chunkY, size, originX, originY, terrain };
}
