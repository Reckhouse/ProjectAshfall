import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bases, playerResources, players } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("player provisioning", () => {
  it("creates one player, one base, and server starting resources", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const snapshot = await ensurePlayerProvisioned(db, "user-1", {
      rng: createSeededRng("provision-a"),
    });

    expect(snapshot.status).toBe("ACTIVE");
    expect(snapshot.world).toBe("ashfall-test");
    expect(snapshot.base).toEqual(
      expect.objectContaining({
        status: "ESTABLISHED",
        storageLevel: 1,
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    expect(snapshot.resources).toEqual({
      energy: balanceV1.startingResources.energy,
      metal: balanceV1.startingResources.metal,
      energyCap: balanceV1.economy.passive.energyCap,
      metalCap: balanceV1.economy.passive.metalCap,
      energyPerHour: balanceV1.economy.passive.energyPerHour,
      metalPerHour: balanceV1.economy.passive.metalPerHour,
    });
    expect(snapshot.location).toEqual({
      type: "BASE",
      x: snapshot.base?.x,
      y: snapshot.base?.y,
    });
    expect(snapshot.troops).toEqual({
      defense: { atBase: 2, deployed: 0 },
      offense: { atBase: 2, deployed: 0 },
    });
    expect(snapshot.expedition).toBeNull();

    const playerRows = await db.select().from(players);
    const baseRows = await db.select().from(bases);
    const resourceRows = await db.select().from(playerResources);
    expect(playerRows).toHaveLength(1);
    expect(baseRows).toHaveLength(1);
    expect(resourceRows).toHaveLength(1);
    await client.close();
  });

  it("is idempotent when called twice for the same auth user", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const first = await ensurePlayerProvisioned(db, "user-repeat", {
      rng: createSeededRng("provision-repeat"),
    });
    const second = await ensurePlayerProvisioned(db, "user-repeat", {
      rng: createSeededRng("provision-repeat-different"),
    });

    expect(second.base).toEqual(first.base);
    expect(second.resources).toEqual(first.resources);

    const playerRows = await db.select().from(players).where(eq(players.authUserId, "user-repeat"));
    const baseRows = await db.select().from(bases);
    expect(playerRows).toHaveLength(1);
    expect(baseRows).toHaveLength(1);
    expect(baseRows[0]?.playerId).toBe(playerRows[0]?.id);
    await client.close();
  });

  it("concurrent calls for the same user converge on one player and base", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const [a, b] = await Promise.all([
      ensurePlayerProvisioned(db, "user-race", { rng: createSeededRng("race-a") }),
      ensurePlayerProvisioned(db, "user-race", { rng: createSeededRng("race-b") }),
    ]);

    expect(a.base).toEqual(b.base);
    expect(a.resources).toEqual(b.resources);
    const playerRows = await db.select().from(players).where(eq(players.authUserId, "user-race"));
    const baseRows = await db.select().from(bases);
    expect(playerRows).toHaveLength(1);
    expect(baseRows).toHaveLength(1);
    await client.close();
  });

  it("does not grant duplicate starting resources on recovery", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "user-resources");
    await ensurePlayerProvisioned(db, "user-resources");
    const [player] = await db.select().from(players).where(eq(players.authUserId, "user-resources"));
    const resources = await db
      .select()
      .from(playerResources)
      .where(eq(playerResources.playerId, player!.id));
    expect(resources).toHaveLength(1);
    expect(resources[0]?.energy).toBe(250);
    expect(resources[0]?.metal).toBe(150);
    await client.close();
  });
});
