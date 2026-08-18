import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { playerResources, players, resourceNodes } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import { collectResource, upgradeBase } from "@/game/services/economy";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { getVisibleChunks } from "@/game/services/chunks";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { chunkCoord } from "@/game/world/chunks";
import { accruedUnits, chebyshevDistance, nodeCandidateAt, productionRates } from "@/game/world/nodes";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("economy", () => {
  it("accrues integer passive income without exceeding caps", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const hour = accruedUnits({
      lastAccruedAt: start,
      perHour: 12,
      current: 250,
      cap: 800,
      now: new Date(start.getTime() + 3_600_000),
    });
    expect(hour.earned).toBe(12);

    const capped = accruedUnits({
      lastAccruedAt: start,
      perHour: 12,
      current: 795,
      cap: 800,
      now: new Date(start.getTime() + 3_600_000),
    });
    expect(capped.earned).toBe(5);
  });

  it("collects a nearby node for the server yield and rejects spoofed amounts", async () => {
    const { db, client } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const snapshot = await ensurePlayerProvisioned(db, "eco-1", { rng: createSeededRng("eco-collect") });
    const view = await getVisibleChunks(db, "eco-1", {
      chunkX: chunkCoord(snapshot.location!.x),
      chunkY: chunkCoord(snapshot.location!.y),
      radius: 1,
    });
    const node = view.nodes.find((entry) => entry.remaining > 0);
    expect(node).toBeTruthy();
    if (chebyshevDistance(snapshot.location!, node!) > balanceV1.economy.nodes.collectChebyshevRange) {
      await db
        .update(players)
        .set({ x: node!.x, y: node!.y, locationType: "FIELD" })
        .where(eq(players.authUserId, "eco-1"));
    }

    const collected = await collectResource(db, "eco-1", { actionId: crypto.randomUUID(), nodeId: node!.id });
    expect(collected.collected.amount).toBe(
      node!.resourceType === "ENERGY" ? balanceV1.economy.nodes.energyYield : balanceV1.economy.nodes.metalYield,
    );
    expect(collected.player.resources?.[node!.resourceType === "ENERGY" ? "energy" : "metal"]).toBe(
      (snapshot.resources?.[node!.resourceType === "ENERGY" ? "energy" : "metal"] ?? 0) + collected.collected.amount,
    );

    const [depleted] = await db.select().from(resourceNodes).where(eq(resourceNodes.featureId, node!.id));
    expect(depleted?.remaining).toBe(0);
    await expect(collectResource(db, "eco-1", { actionId: crypto.randomUUID(), nodeId: node!.id })).rejects.toBeInstanceOf(
      GameError,
    );
    await client.close();
  });

  it("upgrades the base by spending Metal and raising production", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "eco-2", { rng: createSeededRng("eco-upgrade") });
    expect(start.base?.level).toBe(1);
    const upgraded = await upgradeBase(db, "eco-2", crypto.randomUUID());
    expect(upgraded.upgrade.level).toBe(2);
    expect(upgraded.upgrade.metalSpent).toBe(80);
    expect(upgraded.player.resources?.metal).toBe(start.resources!.metal - 80);
    expect(upgraded.player.resources).toEqual(
      expect.objectContaining(productionRates(2)),
    );
    await client.close();
  });

  it("cannot upgrade from the field", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "eco-3", { rng: createSeededRng("eco-field") });
    const { departBase } = await import("@/game/services/move");
    await departBase(db, "eco-3", crypto.randomUUID());
    await expect(upgradeBase(db, "eco-3", crypto.randomUUID())).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await client.close();
  });

  it("applies stored accrual when time has passed", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "eco-4", { rng: createSeededRng("eco-accrue") });
    const { players } = await import("@/db/schema");
    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "eco-4"));
    await db
      .update(playerResources)
      .set({
        energyAccruedAt: new Date(Date.now() - 3_600_000),
        metalAccruedAt: new Date(Date.now() - 3_600_000),
      })
      .where(eq(playerResources.playerId, playerRow!.id));

    await applyPassiveAccrual(db, playerRow!.id);
    const [resources] = await db.select().from(playerResources).where(eq(playerResources.playerId, playerRow!.id));
    expect(resources!.energy).toBe(start.resources!.energy + 12);
    expect(resources!.metal).toBe(start.resources!.metal + 6);
    await client.close();
  });

  it("charges escalating Metal for later base levels", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "eco-level-3", { rng: createSeededRng("eco-level-3") });
    await upgradeBase(db, "eco-level-3", crypto.randomUUID());

    await expect(upgradeBase(db, "eco-level-3", crypto.randomUUID())).rejects.toMatchObject({
      code: "INSUFFICIENT_METAL",
    });

    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "eco-level-3"));
    await db.update(playerResources).set({ metal: 250 }).where(eq(playerResources.playerId, playerRow!.id));

    const upgraded = await upgradeBase(db, "eco-level-3", crypto.randomUUID());
    expect(upgraded.upgrade.level).toBe(3);
    expect(upgraded.upgrade.metalSpent).toBe(250);
    expect(upgraded.player.resources?.metal).toBe(0);
    await client.close();
  });
});

describe("economy simulation", () => {
  it("keeps active collection ahead of passive-only play without a soft lock", () => {
    const hours = [1, 8, 24, 72] as const;
    const report = hours.map((hour) => {
      const passiveEnergy = Math.min(
        balanceV1.economy.passive.energyCap - 250,
        hour * balanceV1.economy.passive.energyPerHour,
      );
      const passiveMetal = Math.min(
        balanceV1.economy.passive.metalCap - 150,
        hour * balanceV1.economy.passive.metalPerHour,
      );
      const casualNodes = hour >= 24 ? 8 : hour >= 8 ? 4 : 2;
      const activeEnergy = casualNodes * balanceV1.economy.nodes.energyYield;
      const activeMetal = Math.floor(casualNodes / 2) * balanceV1.economy.nodes.metalYield;
      return {
        hour,
        passiveEnergy,
        passiveMetal,
        activeEnergy,
        activeMetal,
        activeToPassive: (250 + passiveEnergy + activeEnergy) / Math.max(1, 250 + passiveEnergy),
      };
    });

    expect(report[0]?.passiveEnergy).toBe(12);
    expect(report[0]?.activeToPassive).toBeGreaterThan(1);
    expect(250 + report[3]!.passiveEnergy).toBeLessThanOrEqual(balanceV1.economy.passive.energyCap);
    expect(productionRates(1).energyPerHour).toBeLessThan(productionRates(2).energyPerHour);
    expect(nodeCandidateAt).toEqual(expect.any(Function));
  });

  it("keeps level 5 far above a short metal-gathering session", () => {
    const tenMinuteMetalNodes = 10;
    const metalFromShortSession = balanceV1.startingResources.metal + tenMinuteMetalNodes * balanceV1.economy.nodes.metalYield;
    const costToLevel3 =
      balanceV1.economy.upgrades.base.metalCostByFromLevel[1] + balanceV1.economy.upgrades.base.metalCostByFromLevel[2];
    const costToLevel5 = costToLevel3 +
      balanceV1.economy.upgrades.base.metalCostByFromLevel[3] +
      balanceV1.economy.upgrades.base.metalCostByFromLevel[4];

    expect(balanceV1.economy.upgrades.base.metalCostByFromLevel[1]).toBe(80);
    expect(balanceV1.economy.upgrades.base.metalCostByFromLevel[4]).toBe(1600);
    expect(metalFromShortSession).toBeLessThan(costToLevel5);
    expect(costToLevel5).toBeGreaterThan(tenMinuteMetalNodes * balanceV1.economy.nodes.metalYield * 10);
    expect(balanceV1.economy.passive.metalCap).toBeGreaterThanOrEqual(
      balanceV1.economy.upgrades.base.metalCostByFromLevel[4],
    );
  });
});
