import { and, eq, gte, lte } from "drizzle-orm";
import { resourceNodes, worldFeatures } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import type { WorldView } from "@/game/domain/types";
import { createId } from "@/lib/ids";
import { candidatesInChunk } from "@/game/world/nodes";

export async function materializeChunkNodes(db: AppDb | AppTx, world: WorldView, chunkX: number, chunkY: number) {
  const candidates = candidatesInChunk(world, chunkX, chunkY);
  for (const candidate of candidates) {
    await db
      .insert(worldFeatures)
      .values({
        id: createId(),
        worldId: world.id,
        chunkX: candidate.chunkX,
        chunkY: candidate.chunkY,
        featureType: candidate.featureType,
        x: candidate.x,
        y: candidate.y,
        generationVersion: world.generationVersion,
      })
      .onConflictDoNothing({ target: [worldFeatures.worldId, worldFeatures.x, worldFeatures.y] });
  }

  const features = await db
    .select()
    .from(worldFeatures)
    .where(and(eq(worldFeatures.worldId, world.id), eq(worldFeatures.chunkX, chunkX), eq(worldFeatures.chunkY, chunkY)));

  const yieldByType = {
    ENERGY_NODE: balanceV1.economy.nodes.energyYield,
    METAL_NODE: balanceV1.economy.nodes.metalYield,
  } as const;

  for (const feature of features) {
    if (feature.featureType !== "ENERGY_NODE" && feature.featureType !== "METAL_NODE") {
      continue;
    }
    const yieldAmount = yieldByType[feature.featureType];
    await db
      .insert(resourceNodes)
      .values({
        featureId: feature.id,
        resourceType: feature.featureType === "ENERGY_NODE" ? "ENERGY" : "METAL",
        capacity: yieldAmount,
        remaining: yieldAmount,
      })
      .onConflictDoNothing({ target: resourceNodes.featureId });
  }
}

export async function listNodesInBounds(
  db: AppDb | AppTx,
  worldId: string,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  return db
    .select({
      id: worldFeatures.id,
      x: worldFeatures.x,
      y: worldFeatures.y,
      resourceType: resourceNodes.resourceType,
      remaining: resourceNodes.remaining,
      capacity: resourceNodes.capacity,
    })
    .from(worldFeatures)
    .innerJoin(resourceNodes, eq(resourceNodes.featureId, worldFeatures.id))
    .where(
      and(
        eq(worldFeatures.worldId, worldId),
        gte(worldFeatures.x, bounds.minX),
        lte(worldFeatures.x, bounds.maxX),
        gte(worldFeatures.y, bounds.minY),
        lte(worldFeatures.y, bounds.maxY),
      ),
    );
}
