import { createMemoryDb } from "@/db/client";
import { seedActiveWorld } from "@/db/seed";
import { players } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { SpawnRegion, WorldView } from "@/game/domain/types";
import { createId } from "@/lib/ids";
import { isValidBaseTile } from "@/game/world/terrain";
import { worlds, worldRegions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function setupIsolatedGameDb(options?: {
  width?: number;
  height?: number;
  regionSize?: number;
  seed?: string;
}) {
  const { db, client } = await createMemoryDb();
  const seeded = await seedActiveWorld(db, {
    slug: "ashfall-test",
    width: options?.width ?? 64,
    height: options?.height ?? 64,
    regionSize: options?.regionSize ?? 32,
    seed: options?.seed ?? "test-world-seed-v1",
    generationVersion: 1,
    balanceVersion: 1,
  });
  const [worldRow] = await db.select().from(worlds).where(eq(worlds.id, seeded.worldId)).limit(1);
  const [regionRow] = await db.select().from(worldRegions).where(eq(worldRegions.id, seeded.regionId)).limit(1);
  if (!worldRow || !regionRow) {
    throw new Error("Failed to seed test world");
  }

  const world: WorldView = {
    id: worldRow.id,
    slug: worldRow.slug,
    seed: worldRow.seed,
    generationVersion: worldRow.generationVersion,
    width: worldRow.width,
    height: worldRow.height,
  };
  const region: SpawnRegion = {
    id: regionRow.id,
    worldId: regionRow.worldId,
    minX: regionRow.minX,
    maxX: regionRow.maxX,
    minY: regionRow.minY,
    maxY: regionRow.maxY,
    spawnEnabled: regionRow.spawnEnabled,
    spawnWeight: regionRow.spawnWeight,
  };

  return { db, client, world, region };
}

export async function insertProvisioningPlayer(db: AppDb, authUserId = createId()) {
  const id = createId();
  await db.insert(players).values({
    id,
    authUserId,
    status: "PROVISIONING",
  });
  return { id, authUserId };
}

export function findPassableTiles(
  world: WorldView,
  region: SpawnRegion,
  limit = 40,
): Array<{ x: number; y: number }> {
  const found: Array<{ x: number; y: number }> = [];
  for (let y = region.minY; y <= region.maxY && found.length < limit; y += 1) {
    for (let x = region.minX; x <= region.maxX && found.length < limit; x += 1) {
      if (isValidBaseTile(world, x, y)) {
        found.push({ x, y });
      }
    }
  }
  return found;
}
