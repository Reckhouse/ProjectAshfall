import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb } from "@/db/client";
import { seedActiveWorld, ACTIVE_WORLD_SLUG } from "@/db/seed";
import { worldRegions, worlds } from "@/db/schema";

describe("active world seed", () => {
  it("is idempotent", async () => {
    const { db, client } = await createMemoryDb();
    const first = await seedActiveWorld(db);
    const second = await seedActiveWorld(db);
    expect(second.worldId).toBe(first.worldId);
    expect(second.regionId).toBe(first.regionId);

    const worldRows = await db.select().from(worlds).where(eq(worlds.slug, ACTIVE_WORLD_SLUG));
    const regionRows = await db.select().from(worldRegions);
    expect(worldRows).toHaveLength(1);
    expect(worldRows[0]?.status).toBe("ACTIVE");
    expect(worldRows[0]?.width).toBe(2048);
    expect(worldRows[0]?.height).toBe(2048);
    expect(regionRows).toHaveLength(1);
    expect(regionRows[0]?.maxX - regionRows[0]!.minX + 1).toBe(512);
    expect(regionRows[0]?.spawnEnabled).toBe(true);
    await client.close();
  });
});
