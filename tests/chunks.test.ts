import { describe, expect, it } from "vitest";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import { getVisibleChunks } from "@/game/services/chunks";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { chunkCoord, materializeChunk, terrainKind } from "@/game/world/chunks";
import { createSeededRng } from "@/game/world/rng";
import { isPassable } from "@/game/world/terrain";
import { setupIsolatedGameDb } from "./helpers/db";

describe("chunks and terrain v1", () => {
  it("keeps passability identical to the Phase 1 generator", () => {
    const world = {
      id: "world-1",
      slug: "ashfall-01",
      seed: "test-world-seed-v1",
      generationVersion: 1 as const,
      width: 64,
      height: 64,
    };
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const passable = isPassable(world, x, y);
        const kind = terrainKind(world, x, y);
        if (passable) {
          expect(["plains", "ash"]).toContain(kind);
        } else {
          expect(["rock", "ruin"]).toContain(kind);
        }
      }
    }
  });

  it("materializes deterministic 32x32 chunks", () => {
    const world = {
      id: "world-1",
      slug: "ashfall-01",
      seed: "chunk-seed-v1",
      generationVersion: 1,
      width: 2048,
      height: 2048,
    };
    const first = materializeChunk(world, 3, 5);
    const second = materializeChunk({ ...world }, 3, 5);
    expect(first.size).toBe(balanceV1.world.chunkSize);
    expect(first.terrain).toHaveLength(32 * 32);
    expect(second).toEqual(first);
    expect(first.originX).toBe(96);
    expect(first.originY).toBe(160);
  });

  it("returns nearby chunks without leaking the world seed", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const snapshot = await ensurePlayerProvisioned(db, "chunk-user", { rng: createSeededRng("chunk-view") });
    const view = await getVisibleChunks(db, "chunk-user", {
      chunkX: chunkCoord(snapshot.location!.x),
      chunkY: chunkCoord(snapshot.location!.y),
      radius: 1,
    });
    expect(view.world).toBe("ashfall-test");
    expect(view.chunks.length).toBe(9);
    expect(JSON.stringify(view)).not.toMatch(/seed/i);
    expect(view.player.x).toBe(snapshot.location?.x);
    expect(view.bases.some((base) => base.owned && base.x === snapshot.base?.x && base.y === snapshot.base?.y)).toBe(
      true,
    );
    await client.close();
  });

  it("rejects chunk queries far from the commander", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "chunk-far", { rng: createSeededRng("chunk-far") });
    await expect(getVisibleChunks(db, "chunk-far", { chunkX: 40, chunkY: 40 })).rejects.toMatchObject({
      code: "INVALID_COMMAND",
    });
    await expect(getVisibleChunks(db, "missing", { chunkX: 0, chunkY: 0 })).rejects.toBeInstanceOf(GameError);
    await client.close();
  });
});
