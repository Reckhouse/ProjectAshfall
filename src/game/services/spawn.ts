import { and, eq, gte, lte } from "drizzle-orm";
import { bases } from "@/db/schema";
import type { DbExecutor } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type { Rng, SpawnRegion, WorldView } from "@/game/domain/types";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";
import { isInsideRegion, isValidBaseTile, violatesBaseSeparation } from "@/game/world/terrain";

export type AllocateBaseSpawnInput = {
  db: DbExecutor;
  world: WorldView;
  regions: SpawnRegion[];
  playerId: string;
  rng: Rng;
  exclusionRadius?: number;
  attemptLimit?: number;
};

export type AllocateBaseSpawnResult = {
  id: string;
  x: number;
  y: number;
  attempts: number;
};

function pickSpawnRegion(regions: SpawnRegion[], rng: Rng): SpawnRegion {
  const enabled = regions.filter((region) => region.spawnEnabled && region.spawnWeight > 0);
  if (enabled.length === 0) {
    throw new GameError("BASE_SPAWN_FAILED", "No spawn-enabled region is available.", 500);
  }

  const totalWeight = enabled.reduce((sum, region) => sum + region.spawnWeight, 0);
  let roll = rng.nextInt(0, totalWeight);
  for (const region of enabled) {
    roll -= region.spawnWeight;
    if (roll < 0) {
      return region;
    }
  }
  return enabled[enabled.length - 1]!;
}

export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
}

export async function allocateBaseSpawn(input: AllocateBaseSpawnInput): Promise<AllocateBaseSpawnResult> {
  const exclusionRadius = input.exclusionRadius ?? balanceV1.spawn.baseExclusionRadius;
  const attemptLimit = input.attemptLimit ?? balanceV1.spawn.attemptLimit;
  const region = pickSpawnRegion(input.regions, input.rng);

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const x = input.rng.nextInt(region.minX, region.maxX + 1);
    const y = input.rng.nextInt(region.minY, region.maxY + 1);

    if (!isInsideRegion(region, x, y) || !isValidBaseTile(input.world, x, y)) {
      logEvent({ event: "base.spawn.retry", attempts: attempt, code: "INVALID_TILE" });
      continue;
    }

    const nearby = await input.db
      .select({
        x: bases.x,
        y: bases.y,
        playerId: bases.playerId,
      })
      .from(bases)
      .where(
        and(
          eq(bases.worldId, input.world.id),
          gte(bases.x, x - exclusionRadius),
          lte(bases.x, x + exclusionRadius),
          gte(bases.y, y - exclusionRadius),
          lte(bases.y, y + exclusionRadius),
        ),
      );

    if (nearby.some((base) => violatesBaseSeparation({ x, y }, base, exclusionRadius))) {
      logEvent({ event: "base.spawn.retry", attempts: attempt, code: "SEPARATION" });
      continue;
    }

    const id = createId();
    const inserted = await input.db
      .insert(bases)
      .values({
        id,
        worldId: input.world.id,
        playerId: input.playerId,
        x,
        y,
        level: 1,
      })
      .onConflictDoNothing({ target: [bases.worldId, bases.x, bases.y] })
      .returning({ id: bases.id });

    if (inserted.length === 0) {
      logEvent({ event: "base.spawn.retry", attempts: attempt, code: "COORDINATE_TAKEN" });
      continue;
    }

    logEvent({ event: "base.spawn.completed", attempts: attempt, playerId: input.playerId });
    return { id, x, y, attempts: attempt };
  }

  throw new GameError("BASE_SPAWN_FAILED", "Could not allocate a valid base location.", 409);
}
