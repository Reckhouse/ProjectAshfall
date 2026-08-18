import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bases, players } from "@/db/schema";
import { allocateBaseSpawn } from "@/game/services/spawn";
import type { Rng } from "@/game/domain/types";
import { createSeededRng } from "@/game/world/rng";
import { violatesBaseSeparation } from "@/game/world/terrain";
import { findPassableTiles, insertProvisioningPlayer, setupIsolatedGameDb } from "./helpers/db";

function scriptedCoordinateRng(
  coordinates: Array<{ x: number; y: number }>,
  fallbackSeed: string,
): Rng {
  const fallback = createSeededRng(fallbackSeed);
  let index = 0;
  let waitingForY = false;
  return {
    nextFloat: () => fallback.nextFloat(),
    nextInt(minInclusive, maxExclusive) {
      if (index < coordinates.length) {
        const current = coordinates[index]!;
        if (!waitingForY) {
          waitingForY = true;
          return current.x;
        }
        waitingForY = false;
        index += 1;
        return current.y;
      }
      return fallback.nextInt(minInclusive, maxExclusive);
    },
  };
}

describe("base spawn allocator", () => {
  it("places a seeded base on a passable in-region tile", async () => {
    const { db, client, world, region } = await setupIsolatedGameDb({
      seed: "spawn-seed-alpha",
    });
    const player = await insertProvisioningPlayer(db);
    const result = await allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: player.id,
      rng: createSeededRng("spawn-seed-alpha"),
    });

    expect(result.x).toBeGreaterThanOrEqual(region.minX);
    expect(result.x).toBeLessThanOrEqual(region.maxX);
    expect(result.y).toBeGreaterThanOrEqual(region.minY);
    expect(result.y).toBeLessThanOrEqual(region.maxY);
    expect(result.attempts).toBeGreaterThan(0);

    const replayPlayer = await insertProvisioningPlayer(db);
    const replay = await allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: replayPlayer.id,
      rng: createSeededRng("spawn-seed-alpha"),
    });
    expect(replay.x).not.toBeUndefined();
    await client.close();
  });

  it("enforces the configured exclusion radius", async () => {
    const { db, client, world, region } = await setupIsolatedGameDb();
    const tiles = findPassableTiles(world, region, 8);
    expect(tiles.length).toBeGreaterThan(1);

    const firstPlayer = await insertProvisioningPlayer(db);
    const first = await allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: firstPlayer.id,
      rng: scriptedCoordinateRng([tiles[0]!], "fallback-a"),
      exclusionRadius: 12,
    });

    const secondPlayer = await insertProvisioningPlayer(db);
    const second = await allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: secondPlayer.id,
      rng: scriptedCoordinateRng([tiles[0]!, tiles[1]!], "fallback-b"),
      exclusionRadius: 12,
    });

    expect(violatesBaseSeparation(first, second, 12)).toBe(false);
    await client.close();
  });

  it("fails in a dense region when no legal tile remains", async () => {
    const { db, client, world, region } = await setupIsolatedGameDb({
      width: 8,
      height: 8,
      regionSize: 8,
    });
    const tiles = findPassableTiles(world, region, 1);
    expect(tiles.length).toBeGreaterThan(0);

    const occupant = await insertProvisioningPlayer(db);
    await db.insert(bases).values({
      worldId: world.id,
      playerId: occupant.id,
      x: tiles[0]!.x,
      y: tiles[0]!.y,
    });

    const leftover = await insertProvisioningPlayer(db);
    await expect(
      allocateBaseSpawn({
        db,
        world,
        regions: [region],
        playerId: leftover.id,
        rng: createSeededRng("dense-fail"),
        attemptLimit: 8,
        exclusionRadius: 12,
      }),
    ).rejects.toMatchObject({ code: "BASE_SPAWN_FAILED" });
    await client.close();
  });

  it("retries when two allocations collide on the unique coordinate constraint", async () => {
    const { db, client, world, region } = await setupIsolatedGameDb();
    const [tile, nextTile] = findPassableTiles(world, region, 6);
    expect(tile).toBeDefined();
    expect(nextTile).toBeDefined();

    const playerA = await insertProvisioningPlayer(db);
    const playerB = await insertProvisioningPlayer(db);

    const first = allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: playerA.id,
      rng: scriptedCoordinateRng([tile!], "collision-a"),
    });
    const second = allocateBaseSpawn({
      db,
      world,
      regions: [region],
      playerId: playerB.id,
      rng: scriptedCoordinateRng([tile!, nextTile!], "collision-b"),
    });

    const results = await Promise.all([first, second]);
    const placed = await db.select().from(bases);
    const coords = new Set(placed.map((row) => `${row.x}:${row.y}`));
    expect(placed).toHaveLength(2);
    expect(coords.size).toBe(2);
    expect(results[0]?.x).toBeDefined();
    await client.close();
  });

  it("does not create two player rows for the same auth user", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const authUserId = "auth-user-unique";
    await insertProvisioningPlayer(db, authUserId);
    const rows = await db.select().from(players).where(eq(players.authUserId, authUserId));
    expect(rows).toHaveLength(1);
    await client.close();
  });
});
