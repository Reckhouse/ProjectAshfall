import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bases, playerResources, players, raidCooldowns, troopStacks } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { cappedLoot, isNewPlayerProtected, raidBase } from "@/game/services/raid";
import { departBase } from "@/game/services/move";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

async function agePlayer(
  db: Awaited<ReturnType<typeof setupIsolatedGameDb>>["db"],
  authUserId: string,
  ageMs: number,
) {
  await db
    .update(players)
    .set({ createdAt: new Date(Date.now() - ageMs) })
    .where(eq(players.authUserId, authUserId));
}

describe("raid loot math", () => {
  it("caps stolen resources and never exceeds the stockpile", () => {
    expect(cappedLoot(0, 1200, 120)).toBe(0);
    expect(cappedLoot(50, 1200, 120)).toBe(6);
    expect(cappedLoot(20_000, 1200, 180)).toBe(180);
    expect(cappedLoot(10, 12_000, 180)).toBe(10);
  });

  it("protects commanders younger than 72 hours", () => {
    const now = new Date("2026-08-19T00:00:00.000Z");
    expect(isNewPlayerProtected(new Date(now.getTime() - 71 * 3_600_000), now)).toBe(true);
    expect(isNewPlayerProtected(new Date(now.getTime() - 73 * 3_600_000), now)).toBe(false);
  });
});

describe("pvp raids", () => {
  it("rejects protected, own-base, and empty-expedition raids", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const defender = await ensurePlayerProvisioned(db, "raid-b", { rng: createSeededRng("raid-b") });
    await ensurePlayerProvisioned(db, "raid-a", { rng: createSeededRng("raid-a") });
    const [defenderBase] = await db
      .select()
      .from(bases)
      .where(eq(bases.playerId, (await db.select().from(players).where(eq(players.authUserId, "raid-b")))[0]!.id));
    const [attackerBase] = await db
      .select()
      .from(bases)
      .where(eq(bases.playerId, (await db.select().from(players).where(eq(players.authUserId, "raid-a")))[0]!.id));

    await expect(
      raidBase(db, "raid-a", { actionId: crypto.randomUUID(), targetBaseId: attackerBase!.id }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });

    await departBase(db, "raid-a", crypto.randomUUID(), 2);
    await db
      .update(players)
      .set({ x: defender.base!.x, y: defender.base!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "raid-a"));
    await expect(
      raidBase(db, "raid-a", { actionId: crypto.randomUUID(), targetBaseId: defenderBase!.id }),
    ).rejects.toMatchObject({ code: "BASE_PROTECTED" });

    await agePlayer(db, "raid-b", balanceV1.pvp.newPlayerProtectionMs + 60_000);
    await db
      .update(players)
      .set({ locationType: "BASE" })
      .where(eq(players.authUserId, "raid-a"));
    await expect(
      raidBase(db, "raid-a", { actionId: crypto.randomUUID(), targetBaseId: defenderBase!.id }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await client.close();
  });

  it("resolves a raid, caps loot, persists a report, and enforces repeat-target cooldown", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "raid-win-a", { rng: createSeededRng("raid-win-a") });
    const defender = await ensurePlayerProvisioned(db, "raid-win-b", { rng: createSeededRng("raid-win-b") });
    await agePlayer(db, "raid-win-b", balanceV1.pvp.newPlayerProtectionMs + 60_000);
    const [defenderRow] = await db.select().from(players).where(eq(players.authUserId, "raid-win-b"));
    const [attackerRow] = await db.select().from(players).where(eq(players.authUserId, "raid-win-a"));
    const [defenderBase] = await db.select().from(bases).where(eq(bases.playerId, defenderRow!.id));

    await db.update(playerResources).set({ energy: 800, metal: 2000 }).where(eq(playerResources.playerId, defenderRow!.id));
    await db.update(playerResources).set({ energy: 400, metal: 400 }).where(eq(playerResources.playerId, attackerRow!.id));
    await db
      .update(troopStacks)
      .set({ quantity: 1 })
      .where(eq(troopStacks.playerId, defenderRow!.id));
    await departBase(db, "raid-win-a", crypto.randomUUID(), 2);
    await db
      .update(troopStacks)
      .set({ quantity: 12 })
      .where(eq(troopStacks.locationType, "EXPEDITION"));
    await db
      .update(players)
      .set({ x: defender.base!.x, y: defender.base!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "raid-win-a"));

    const actionId = crypto.randomUUID();
    const first = await raidBase(db, "raid-win-a", { actionId, targetBaseId: defenderBase!.id });
    expect(first.battle.outcome).toBe("ATTACKER_WIN");
    expect(first.loot.energy).toBeLessThanOrEqual(balanceV1.pvp.energyLootCap);
    expect(first.loot.metal).toBeLessThanOrEqual(balanceV1.pvp.metalLootCap);
    expect(first.player.troops.offense.deployed).toBe(first.battle.attackerRemaining);
    expect(first.player.resources?.energy).toBeGreaterThan(0);

    const replayed = await raidBase(db, "raid-win-a", { actionId, targetBaseId: defenderBase!.id });
    expect(replayed.loot).toEqual(first.loot);
    expect(replayed.battle.seed).toBe(first.battle.seed);

    await expect(
      raidBase(db, "raid-win-a", { actionId: crypto.randomUUID(), targetBaseId: defenderBase!.id }),
    ).rejects.toMatchObject({ code: "RAID_COOLDOWN" });

    await db
      .update(raidCooldowns)
      .set({ lastRaidAt: new Date(Date.now() - balanceV1.pvp.repeatTargetCooldownMs - 1000) })
      .where(eq(raidCooldowns.attackerPlayerId, attackerRow!.id));

    const second = await raidBase(db, "raid-win-a", { actionId: crypto.randomUUID(), targetBaseId: defenderBase!.id });
    expect(["ATTACKER_WIN", "DEFENDER_WIN"]).toContain(second.battle.outcome);

    const [victim] = await db.select().from(playerResources).where(eq(playerResources.playerId, defenderRow!.id));
    expect(victim!.energy).toBeGreaterThan(0);
    expect(victim!.metal).toBeGreaterThan(0);
    expect(2000 - victim!.metal).toBeLessThanOrEqual(balanceV1.pvp.metalLootCap * 2);
    await client.close();
  });
});
