import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { botProfiles, players, troopStacks } from "@/db/schema";
import { loadAdminStats } from "@/game/services/admin-stats";
import { spawnBot, tickEnabledBots } from "@/game/services/bots";
import { collectResource } from "@/game/services/economy";
import { departBase } from "@/game/services/move";
import { listNodesInBounds, materializeChunkNodes } from "@/game/services/nodes";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { isNewPlayerProtected } from "@/game/services/raid";
import { chunkCoord } from "@/game/world/chunks";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("bots and admin stats", () => {
  it("spawns a named bot that is immediately raidable and acts through real commands", async () => {
    const { db, client, world } = await setupIsolatedGameDb();
    const bot = await spawnBot(db, { callsign: "AshBot01", difficulty: "SCOUT" });
    expect(bot.displayName).toBe("AshBot01");
    expect(bot.difficulty).toBe("SCOUT");
    expect(bot.enabled).toBe(true);

    const [player] = await db.select().from(players).where(eq(players.id, bot.playerId));
    expect(player?.kind).toBe("BOT");
    expect(isNewPlayerProtected(player!.createdAt, new Date(), "BOT")).toBe(false);
    expect(isNewPlayerProtected(player!.createdAt, new Date(), "HUMAN")).toBe(true);

    const ticked = await tickEnabledBots(db, { playerId: bot.playerId });
    expect(ticked.ticked[0]?.lastAction).toMatch(/recruit-defense|depart/);
    const [profile] = await db.select().from(botProfiles).where(eq(botProfiles.playerId, bot.playerId));
    expect(profile?.tickCount).toBe(1);
    await client.close();
    expect(world.slug).toBe("ashfall-test");
  });

  it("records gathered resources in admin stats after a real collect", async () => {
    const { db, client, world } = await setupIsolatedGameDb({ width: 64, height: 64, regionSize: 32 });
    const snapshot = await ensurePlayerProvisioned(db, "gather-admin", { rng: createSeededRng("gather-admin") });
    const cx = chunkCoord(snapshot.location!.x);
    const cy = chunkCoord(snapshot.location!.y);
    await materializeChunkNodes(db, world, cx, cy);
    const nodes = await listNodesInBounds(db, world.id, {
      minX: snapshot.location!.x - 16,
      maxX: snapshot.location!.x + 16,
      minY: snapshot.location!.y - 16,
      maxY: snapshot.location!.y + 16,
    });
    const node = nodes.find((entry) => entry.remaining > 0);
    expect(node).toBeTruthy();
    await departBase(db, "gather-admin", crypto.randomUUID(), 0);
    await db
      .update(players)
      .set({ x: node!.x, y: node!.y, locationType: "FIELD" })
      .where(eq(players.authUserId, "gather-admin"));
    const collected = await collectResource(db, "gather-admin", {
      actionId: crypto.randomUUID(),
      nodeId: node!.id,
    });
    expect(collected.collected.amount).toBeGreaterThan(0);

    const stats = await loadAdminStats(db);
    expect(stats.gathered.collections).toBeGreaterThan(0);
    expect(stats.gathered.energy + stats.gathered.metal).toBeGreaterThan(0);
    expect(stats.commanders.humans).toBe(1);
    await client.close();
  });

  it("lets a raider bot leave base with offense on later ticks", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const bot = await spawnBot(db, { callsign: "Raider_1", difficulty: "RAIDER" });
    await tickEnabledBots(db, { playerId: bot.playerId });
    await db.update(botProfiles).set({ lastTickAt: new Date(0) }).where(eq(botProfiles.playerId, bot.playerId));
    await tickEnabledBots(db, { playerId: bot.playerId });
    const stacks = await db.select().from(troopStacks).where(eq(troopStacks.playerId, bot.playerId));
    expect(stacks.length).toBeGreaterThan(0);
    const [updated] = (await db.select().from(botProfiles).where(eq(botProfiles.playerId, bot.playerId)));
    expect(updated?.tickCount).toBe(2);
    await client.close();
  });
});
