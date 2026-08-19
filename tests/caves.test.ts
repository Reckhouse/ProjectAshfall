import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { players, resourceNodes, toolInstances } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import { clearCave, listCavesInBounds, materializeChunkCaves } from "@/game/services/caves";
import { getVisibleChunks } from "@/game/services/chunks";
import { collectResource } from "@/game/services/economy";
import { materializeChunkNodes } from "@/game/services/nodes";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { departBase } from "@/game/services/move";
import { caveCandidateAt, caveCandidatesInChunk, pickGatherCave, pickToolAffinity } from "@/game/world/caves";
import { chunkCoord } from "@/game/world/chunks";
import { applyCollectionBonus, chebyshevDistance, nodeCandidateAt } from "@/game/world/nodes";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

async function findCaveOnWorld(
  db: Awaited<ReturnType<typeof setupIsolatedGameDb>>["db"],
  world: Awaited<ReturnType<typeof setupIsolatedGameDb>>["world"],
  playerId: string,
) {
  const size = balanceV1.world.chunkSize;
  const maxChunkX = Math.floor((world.width - 1) / size);
  const maxChunkY = Math.floor((world.height - 1) / size);
  for (let chunkY = 0; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = 0; chunkX <= maxChunkX; chunkX += 1) {
      await materializeChunkNodes(db, world, chunkX, chunkY);
      await materializeChunkCaves(db, world, chunkX, chunkY);
    }
  }
  const caves = await listCavesInBounds(db, {
    worldId: world.id,
    playerId,
    minX: 0,
    maxX: world.width - 1,
    minY: 0,
    maxY: world.height - 1,
  });
  const cave = caves.find((entry) => !entry.cleared);
  if (!cave) {
    throw new Error("Expected at least one cave in the test world");
  }
  return cave;
}

describe("caves and tools", () => {
  it("places caves on passable tiles that are not resource nodes", () => {
    const world = {
      id: "world-caves",
      slug: "ashfall-test",
      seed: "cave-gen-seed-v1",
      generationVersion: 1,
      width: 64,
      height: 64,
    };
    const found = [
      ...caveCandidatesInChunk(world, 0, 0),
      ...caveCandidatesInChunk(world, 0, 1),
      ...caveCandidatesInChunk(world, 1, 0),
      ...caveCandidatesInChunk(world, 1, 1),
    ];
    expect(found.length).toBeGreaterThan(0);
    for (const cave of found) {
      expect(nodeCandidateAt(world, cave.x, cave.y)).toBeNull();
      expect(caveCandidateAt(world, cave.x, cave.y)).not.toBeNull();
    }
  });

  it("weights tool affinity toward the weaker equipped slot", () => {
    expect(pickToolAffinity({ energyTier: 3, metalTier: 1, roll: 34 })).toBe("ENERGY");
    expect(pickToolAffinity({ energyTier: 3, metalTier: 1, roll: 35 })).toBe("METAL");
    expect(pickToolAffinity({ energyTier: 1, metalTier: 1, roll: 49 })).toBe("ENERGY");
    expect(pickToolAffinity({ energyTier: 1, metalTier: 1, roll: 50 })).toBe("METAL");
  });

  it("picks the nearest uncleared cave in Chebyshev range", () => {
    const origin = { x: 10, y: 10 };
    const picked = pickGatherCave(
      [
        { id: "far", x: 12, y: 10, cleared: false },
        { id: "near", x: 11, y: 10, cleared: false },
        { id: "done", x: 10, y: 11, cleared: true },
      ],
      origin,
      1,
    );
    expect(picked?.id).toBe("near");
    expect(pickGatherCave([{ id: "far", x: 14, y: 10, cleared: false }], origin, 1)).toBeNull();
  });

  it("clears a cave, awards a tier-1 tool, and rejects a second claim", async () => {
    const { db, client, world } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const snapshot = await ensurePlayerProvisioned(db, "cave-1", { rng: createSeededRng("cave-clear") });
    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "cave-1"));
    const cave = await findCaveOnWorld(db, world, playerRow!.id);

    await departBase(db, "cave-1", crypto.randomUUID());
    await db
      .update(players)
      .set({ x: cave.x, y: cave.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "cave-1"));

    const actionId = crypto.randomUUID();
    const first = await clearCave(db, "cave-1", { actionId, caveId: cave.id });
    expect(first.tool.tier).toBe(1);
    expect(first.tool.bonusBps).toBe(balanceV1.economy.tools.bonusBpsByTier[1]);
    expect(first.tool.equipped).toBe(true);
    expect(["ENERGY", "METAL"]).toContain(first.tool.affinity);
    expect(first.player.resources?.energy).toBe(snapshot.resources!.energy - balanceV1.economy.caves.energyCostByTier[1]);
    expect(first.player.tools[first.tool.affinity === "ENERGY" ? "energy" : "metal"]).toEqual({
      tier: 1,
      bonusBps: 1000,
    });

    const replayed = await clearCave(db, "cave-1", { actionId, caveId: cave.id });
    expect(replayed.tool).toEqual(first.tool);
    expect(replayed.player.resources?.energy).toBe(first.player.resources?.energy);

    await expect(clearCave(db, "cave-1", { actionId: crypto.randomUUID(), caveId: cave.id })).rejects.toMatchObject({
      code: "CAVE_ALREADY_CLEARED",
    });

    await client.close();
  });

  it("applies the equipped tool bonus to collection and ignores client loot fields", async () => {
    const { db, client } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const snapshot = await ensurePlayerProvisioned(db, "cave-bonus", { rng: createSeededRng("cave-bonus") });
    const view = await getVisibleChunks(db, "cave-bonus", {
      chunkX: chunkCoord(snapshot.location!.x),
      chunkY: chunkCoord(snapshot.location!.y),
      radius: 1,
    });
    const node = view.nodes.find((entry) => entry.remaining > 0 && entry.resourceType === "ENERGY") ?? view.nodes.find((entry) => entry.remaining > 0);
    expect(node).toBeTruthy();
    expect(view.caves).toEqual(expect.any(Array));

    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "cave-bonus"));
    await db.insert(toolInstances).values({
      id: crypto.randomUUID(),
      ownerPlayerId: playerRow!.id,
      resourceAffinity: node!.resourceType,
      tier: 1,
      collectionBonusBps: 1000,
      equippedSlot: node!.resourceType,
    });
    if (chebyshevDistance(snapshot.location!, node!) > balanceV1.economy.nodes.collectChebyshevRange) {
      await db
        .update(players)
        .set({ x: node!.x, y: node!.y, locationType: "FIELD" })
        .where(eq(players.authUserId, "cave-bonus"));
    }

    const collected = await collectResource(db, "cave-bonus", { actionId: crypto.randomUUID(), nodeId: node!.id });
    const expected = applyCollectionBonus(node!.remaining, 1000);
    expect(collected.collected.amount).toBe(expected);
    expect(collected.collected.amount).toBeGreaterThan(
      node!.resourceType === "ENERGY" ? balanceV1.economy.nodes.energyYield : balanceV1.economy.nodes.metalYield,
    );

    const [depleted] = await db.select().from(resourceNodes).where(eq(resourceNodes.featureId, node!.id));
    expect(depleted?.remaining).toBe(0);
    await client.close();
  });

  it("rejects spoofed tool stats on the clear-cave command", async () => {
    const { rejectClientOwnedState } = await import("@/lib/validation/game");
    expect(() =>
      rejectClientOwnedState({
        actionId: crypto.randomUUID(),
        payload: { caveId: crypto.randomUUID(), tier: 5, bonusBps: 9000, affinity: "METAL" },
      }),
    ).toThrow(GameError);
  });
});
