import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { expeditions, players, troopStacks, caves as caveRows, battleReports } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { clearCave, listCavesInBounds, materializeChunkCaves } from "@/game/services/caves";
import { enterBase, departBase } from "@/game/services/move";
import { materializeChunkNodes } from "@/game/services/nodes";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { recruitTroops } from "@/game/services/troops";
import { caveRequiredPower, offensePower } from "@/game/services/troop-state";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("troops and expeditions", () => {
  it("assigns offense to an expedition and returns survivors home", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "troop-1", { rng: createSeededRng("troop-leave") });
    expect(start.troops.offense.atBase).toBe(2);
    expect(start.troops.defense.atBase).toBe(2);

    const field = await departBase(db, "troop-1", crypto.randomUUID(), 2);
    expect(field.location?.type).toBe("FIELD");
    expect(field.troops.offense).toEqual({ atBase: 0, deployed: 2 });
    expect(field.troops.defense).toEqual({ atBase: 2, deployed: 0 });
    expect(field.expedition?.offense).toBe(2);
    expect(field.expedition?.power).toBe(offensePower(2));

    const stacks = await db.select().from(troopStacks);
    const fieldOffense = stacks.filter((stack) => stack.locationType === "EXPEDITION" && stack.unitType === "OFFENSE");
    const homeOffense = stacks.filter((stack) => stack.locationType === "BASE" && stack.unitType === "OFFENSE");
    expect(fieldOffense.reduce((sum, stack) => sum + stack.quantity, 0)).toBe(2);
    expect(homeOffense.reduce((sum, stack) => sum + stack.quantity, 0)).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, balanceV1.movement.minIntervalMs + 30));
    const home = await enterBase(db, "troop-1", crypto.randomUUID());
    expect(home.location?.type).toBe("BASE");
    expect(home.troops.offense).toEqual({ atBase: 2, deployed: 0 });
    expect(home.expedition).toBeNull();
    const active = await db.select().from(expeditions).where(eq(expeditions.status, "ACTIVE"));
    expect(active).toHaveLength(0);
    await client.close();
  });

  it("rejects a second active expedition and preserves quantities under parallel departs", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "troop-race", { rng: createSeededRng("troop-race") });
    const [first, second] = await Promise.allSettled([
      departBase(db, "troop-race", crypto.randomUUID(), 2),
      departBase(db, "troop-race", crypto.randomUUID(), 2),
    ]);
    const wins = [first, second].filter((result) => result.status === "fulfilled");
    const losses = [first, second].filter((result) => result.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);

    const snapshot = await ensurePlayerProvisioned(db, "troop-race");
    expect(snapshot.troops.offense.deployed + snapshot.troops.offense.atBase).toBe(2);
    expect(snapshot.troops.defense.atBase).toBe(2);
    const active = await db.select().from(expeditions).where(eq(expeditions.status, "ACTIVE"));
    expect(active).toHaveLength(1);
    await client.close();
  });

  it("recruits with Metal, rejects field recruitment, and stays idempotent", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "troop-hire", { rng: createSeededRng("troop-hire") });
    const actionId = crypto.randomUUID();
    const first = await recruitTroops(db, "troop-hire", { actionId, unitType: "OFFENSE", count: 1 });
    expect(first.recruited.metalSpent).toBe(40);
    expect(first.player.troops.offense.atBase).toBe(3);
    expect(first.player.resources?.metal).toBe(start.resources!.metal - 40);

    const replayed = await recruitTroops(db, "troop-hire", { actionId, unitType: "OFFENSE", count: 1 });
    expect(replayed.player.troops.offense.atBase).toBe(3);
    expect(replayed.player.resources?.metal).toBe(first.player.resources?.metal);

    await departBase(db, "troop-hire", crypto.randomUUID(), 0);
    await expect(
      recruitTroops(db, "troop-hire", { actionId: crypto.randomUUID(), unitType: "DEFENSE", count: 1 }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await client.close();
  });

  it("serializes parallel recruits so Metal and counts stay consistent", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "troop-parallel", { rng: createSeededRng("troop-parallel") });
    const results = await Promise.all([
      recruitTroops(db, "troop-parallel", { actionId: crypto.randomUUID(), unitType: "OFFENSE", count: 1 }),
      recruitTroops(db, "troop-parallel", { actionId: crypto.randomUUID(), unitType: "OFFENSE", count: 1 }),
    ]);
    const snapshot = await ensurePlayerProvisioned(db, "troop-parallel");
    expect(snapshot.troops.offense.atBase).toBe(4);
    expect(snapshot.resources?.metal).toBe(70);
    expect(results.map((result) => result.player.troops.offense.atBase).sort()).toEqual([3, 4]);
    await client.close();
  });

  it("uses expedition offense strength for cave challenge", async () => {
    const { db, client, world } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    await ensurePlayerProvisioned(db, "troop-cave-weak", { rng: createSeededRng("troop-cave-weak") });
    await ensurePlayerProvisioned(db, "troop-cave-strong", { rng: createSeededRng("troop-cave-strong") });
    const [weak] = await db.select().from(players).where(eq(players.authUserId, "troop-cave-weak"));
    const size = balanceV1.world.chunkSize;
    for (let chunkY = 0; chunkY <= Math.floor((world.height - 1) / size); chunkY += 1) {
      for (let chunkX = 0; chunkX <= Math.floor((world.width - 1) / size); chunkX += 1) {
        await materializeChunkNodes(db, world, chunkX, chunkY);
        await materializeChunkCaves(db, world, chunkX, chunkY);
      }
    }
    const caves = await listCavesInBounds(db, {
      worldId: world.id,
      playerId: weak!.id,
      minX: 0,
      maxX: world.width - 1,
      minY: 0,
      maxY: world.height - 1,
    });
    const cave = caves.find((entry) => !entry.cleared);
    expect(cave).toBeTruthy();

    await departBase(db, "troop-cave-weak", crypto.randomUUID(), 0);
    await db
      .update(players)
      .set({ x: cave!.x, y: cave!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "troop-cave-weak"));
    await expect(clearCave(db, "troop-cave-weak", { actionId: crypto.randomUUID(), caveId: cave!.id })).rejects.toMatchObject({
      code: "INSUFFICIENT_TROOPS",
    });

    await recruitTroops(db, "troop-cave-strong", { actionId: crypto.randomUUID(), unitType: "OFFENSE", count: 1 });
    await recruitTroops(db, "troop-cave-strong", { actionId: crypto.randomUUID(), unitType: "OFFENSE", count: 1 });
    await departBase(db, "troop-cave-strong", crypto.randomUUID(), 4);
    await db
      .update(players)
      .set({ x: cave!.x, y: cave!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "troop-cave-strong"));
    const cleared = await clearCave(db, "troop-cave-strong", { actionId: crypto.randomUUID(), caveId: cave!.id });
    expect(cleared.tool?.tier).toBe(cave!.tier);
    expect(cleared.battle.outcome).toBe("ATTACKER_WIN");
    expect(cleared.battle.attackerCommitted).toBe(4);
    expect(cleared.battle.attackerCasualties).toBeGreaterThanOrEqual(1);
    expect(cleared.player.troops.offense.deployed).toBe(cleared.battle.attackerRemaining);
    expect(offensePower(4)).toBeGreaterThanOrEqual(caveRequiredPower(cave!.tier));
    await client.close();
  });

  it("applies cave combat casualties on defeat and leaves the cave uncleared", async () => {
    const { db, client, world } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const start = await ensurePlayerProvisioned(db, "troop-cave-loss", { rng: createSeededRng("troop-cave-loss") });
    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "troop-cave-loss"));
    const size = balanceV1.world.chunkSize;
    for (let chunkY = 0; chunkY <= Math.floor((world.height - 1) / size); chunkY += 1) {
      for (let chunkX = 0; chunkX <= Math.floor((world.width - 1) / size); chunkX += 1) {
        await materializeChunkNodes(db, world, chunkX, chunkY);
        await materializeChunkCaves(db, world, chunkX, chunkY);
      }
    }
    const nearby = await listCavesInBounds(db, {
      worldId: world.id,
      playerId: playerRow!.id,
      minX: 0,
      maxX: world.width - 1,
      minY: 0,
      maxY: world.height - 1,
    });
    const cave = nearby.find((entry) => !entry.cleared);
    expect(cave).toBeTruthy();
    await db.update(caveRows).set({ tier: 5 }).where(eq(caveRows.featureId, cave!.id));

    await departBase(db, "troop-cave-loss", crypto.randomUUID(), 1);
    await db
      .update(players)
      .set({ x: cave!.x, y: cave!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "troop-cave-loss"));

    const actionId = crypto.randomUUID();
    const lost = await clearCave(db, "troop-cave-loss", { actionId, caveId: cave!.id });
    expect(lost.tool).toBeNull();
    expect(lost.battle.outcome).toBe("DEFENDER_WIN");
    expect(lost.battle.attackerCommitted).toBe(1);
    expect(lost.player.troops.offense.deployed).toBe(lost.battle.attackerRemaining);
    expect(lost.player.resources?.energy).toBe(start.resources!.energy - balanceV1.economy.caves.energyCostByTier[5]);

    const replayed = await clearCave(db, "troop-cave-loss", { actionId, caveId: cave!.id });
    expect(replayed.battle).toEqual(lost.battle);
    expect(replayed.player.resources?.energy).toBe(lost.player.resources?.energy);

    const stillOpen = await listCavesInBounds(db, {
      worldId: world.id,
      playerId: playerRow!.id,
      minX: cave!.x,
      maxX: cave!.x,
      minY: cave!.y,
      maxY: cave!.y,
    });
    expect(stillOpen[0]?.cleared).toBe(false);

    const reports = await db.select().from(battleReports);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.outcome).toBe("DEFENDER_WIN");
    await client.close();
  });
});
