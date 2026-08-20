import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { GET as cronBotsGet } from "@/app/api/cron/bots/route";
import { playerResources, players, troopStacks } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { clearCave, listCavesInBounds, materializeChunkCaves } from "@/game/services/caves";
import { departBase } from "@/game/services/move";
import { materializeChunkNodes } from "@/game/services/nodes";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { caveRequiredPower, offensePower } from "@/game/services/troop-state";
import { cronSecretAuthorized } from "@/lib/auth/admin";
import { getServerEnv } from "@/lib/env";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("audit security fixes", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("rejects cron requests without CRON_SECRET even when x-vercel-cron is spoofed", () => {
    expect(
      cronSecretAuthorized(
        new Request("http://localhost/api/cron/bots", { headers: { "x-vercel-cron": "1" } }),
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          DATABASE_URL: "postgres://user:pass@ep-test.neon.tech/neondb",
          AUTH_SECRET: "x".repeat(32),
        },
      ),
    ).toBe(false);
  });

  it("accepts cron requests with a matching bearer secret", () => {
    const secret = "cron-secret-for-tests-ok";
    expect(
      cronSecretAuthorized(
        new Request("http://localhost/api/cron/bots", {
          headers: { authorization: `Bearer ${secret}` },
        }),
        {
          NODE_ENV: "production",
          VERCEL_ENV: "production",
          DATABASE_URL: "postgres://user:pass@ep-test.neon.tech/neondb",
          AUTH_SECRET: "x".repeat(32),
          CRON_SECRET: secret,
        },
      ),
    ).toBe(true);
  });

  it("returns 401 from the cron route when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const response = await cronBotsGet(
      new Request("http://localhost/api/cron/bots", { headers: { "x-vercel-cron": "1" } }),
    );
    expect(response.status).toBe(401);
  });

  it("uses ADMIN_EMAILS only without hardcoded operator defaults", () => {
    const env = getServerEnv({
      NODE_ENV: "development",
      ADMIN_EMAILS: "extra@ashfall.test",
    });
    expect(env.adminEmails).toEqual(["extra@ashfall.test"]);
  });
});

describe("audit cave power gate", () => {
  it("rejects underpowered cave clears before spending energy", async () => {
    const { db, client, world } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const start = await ensurePlayerProvisioned(db, "audit-cave-gate", { rng: createSeededRng("audit-cave-gate") });
    const [playerRow] = await db.select().from(players).where(eq(players.authUserId, "audit-cave-gate"));
    const size = balanceV1.world.chunkSize;
    for (let chunkY = 0; chunkY <= Math.floor((world.height - 1) / size); chunkY += 1) {
      for (let chunkX = 0; chunkX <= Math.floor((world.width - 1) / size); chunkX += 1) {
        await materializeChunkNodes(db, world, chunkX, chunkY);
        await materializeChunkCaves(db, world, chunkX, chunkY);
      }
    }
    const caves = await listCavesInBounds(db, {
      worldId: world.id,
      playerId: playerRow!.id,
      minX: 0,
      maxX: world.width - 1,
      minY: 0,
      maxY: world.height - 1,
    });
    const cave = caves.find((entry) => !entry.cleared);
    expect(cave).toBeTruthy();

    await departBase(db, "audit-cave-gate", crypto.randomUUID(), 2);
    await db
      .update(players)
      .set({ x: cave!.x, y: cave!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "audit-cave-gate"));

    expect(offensePower(2)).toBeLessThan(caveRequiredPower(cave!.tier));

    await expect(
      clearCave(db, "audit-cave-gate", { actionId: crypto.randomUUID(), caveId: cave!.id }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_TROOPS" });

    const [resources] = await db
      .select()
      .from(playerResources)
      .where(eq(playerResources.playerId, playerRow!.id));
    expect(resources?.energy).toBe(start.resources!.energy);

    const [expedition] = await db
      .select()
      .from(troopStacks)
      .where(and(eq(troopStacks.playerId, playerRow!.id), eq(troopStacks.locationType, "EXPEDITION")));
    expect(expedition?.quantity).toBe(2);
    await client.close();
  });
});
