import { eq } from "drizzle-orm";
import { worldRegions, worlds } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { createId } from "@/lib/ids";
import { getServerEnv } from "@/lib/env";

export const ACTIVE_WORLD_SLUG = balanceV1.world.slug;

export async function seedActiveWorld(
  db: AppDb,
  options?: {
    slug?: string;
    width?: number;
    height?: number;
    regionSize?: number;
    seed?: string;
    generationVersion?: number;
    balanceVersion?: number;
  },
): Promise<{ worldId: string; regionId: string }> {
  const env = getServerEnv();
  const slug = options?.slug ?? ACTIVE_WORLD_SLUG;
  const width = options?.width ?? balanceV1.world.initialWidth;
  const height = options?.height ?? balanceV1.world.initialHeight;
  const regionSize = options?.regionSize ?? balanceV1.world.activeSpawnRegionSize;
  const seed = options?.seed ?? env.worldSeed;
  const generationVersion = options?.generationVersion ?? balanceV1.world.generationVersion;
  const balanceVersion = options?.balanceVersion ?? balanceV1.version;

  const [existingWorld] = await db.select().from(worlds).where(eq(worlds.slug, slug)).limit(1);
  const worldId = existingWorld?.id ?? createId();

  if (!existingWorld) {
    await db.insert(worlds).values({
      id: worldId,
      slug,
      name: slug === ACTIVE_WORLD_SLUG ? balanceV1.world.name : slug,
      status: "ACTIVE",
      seed,
      generationVersion,
      balanceVersion,
      width,
      height,
    });
  }

  const [existingRegion] = await db
    .select()
    .from(worldRegions)
    .where(eq(worldRegions.worldId, worldId))
    .limit(1);

  if (existingRegion) {
    return { worldId, regionId: existingRegion.id };
  }

  const regionId = createId();
  try {
    await db.insert(worldRegions).values({
      id: regionId,
      worldId,
      minX: 0,
      maxX: regionSize - 1,
      minY: 0,
      maxY: regionSize - 1,
      spawnEnabled: true,
      spawnWeight: 1,
      softPlayerCap: null,
    });
    return { worldId, regionId };
  } catch {
    const [raced] = await db
      .select()
      .from(worldRegions)
      .where(eq(worldRegions.worldId, worldId))
      .limit(1);
    if (!raced) {
      throw new Error("Failed to seed spawn region");
    }
    return { worldId, regionId: raced.id };
  }
}
