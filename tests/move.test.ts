import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { players } from "@/db/schema";
import { GameError } from "@/game/domain/errors";
import type { Direction } from "@/game/domain/types";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { departBase, enterBase, movePlayer } from "@/game/services/move";
import { createSeededRng } from "@/game/world/rng";
import { DIRECTIONS, offsetCoordinate } from "@/game/world/directions";
import { isInWorldBounds, isPassable } from "@/game/world/terrain";
import { balanceV1 } from "@/game/config/balance.v1";
import { setupIsolatedGameDb } from "./helpers/db";

async function waitForMoveWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, balanceV1.movement.minIntervalMs + 30));
}

function findNeighbor(
  world: Parameters<typeof isPassable>[0],
  origin: { x: number; y: number },
  passable: boolean,
): { direction: Direction; x: number; y: number } | null {
  for (const direction of DIRECTIONS) {
    const target = offsetCoordinate(origin, direction);
    if (!isInWorldBounds(world, target.x, target.y)) {
      continue;
    }
    if (isPassable(world, target.x, target.y) === passable) {
      return { direction, ...target };
    }
  }
  return null;
}

describe("player movement", () => {
  it("starts at base and cannot move until the commander leaves", async () => {
    const { db, client } = await setupIsolatedGameDb();
    const snapshot = await ensurePlayerProvisioned(db, "mover-1", { rng: createSeededRng("move-start") });
    expect(snapshot.location?.type).toBe("BASE");

    await expect(movePlayer(db, "mover-1", { direction: "north", actionId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "INVALID_COMMAND",
    });

    const afterDepart = await departBase(db, "mover-1", crypto.randomUUID());
    expect(afterDepart.location).toEqual({
      type: "FIELD",
      x: snapshot.base?.x,
      y: snapshot.base?.y,
    });
    await client.close();
  });

  it("moves one cardinal tile, stays put after reload snapshot, and returns to base", async () => {
    const { db, client, world } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "mover-2", { rng: createSeededRng("move-path") });
    const origin = start.location!;
    const neighbor = findNeighbor(world, origin, true);
    expect(neighbor).not.toBeNull();

    await departBase(db, "mover-2", crypto.randomUUID());
    await waitForMoveWindow();
    const moved = await movePlayer(db, "mover-2", {
      direction: neighbor!.direction,
      actionId: crypto.randomUUID(),
    });
    expect(moved.location).toEqual({ type: "FIELD", x: neighbor!.x, y: neighbor!.y });

    const reloaded = await ensurePlayerProvisioned(db, "mover-2");
    expect(reloaded.location).toEqual(moved.location);

    await waitForMoveWindow();
    const returned = await movePlayer(db, "mover-2", {
      direction: neighbor!.direction === "north" ? "south" : neighbor!.direction === "south" ? "north" : neighbor!.direction === "east" ? "west" : "east",
      actionId: crypto.randomUUID(),
    });
    expect(returned.location).toEqual({ type: "BASE", x: origin.x, y: origin.y });
    await client.close();
  });

  it("rejects blocked and out-of-bounds tiles", async () => {
    const { db, client, world } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "mover-3", { rng: createSeededRng("move-block") });
    await departBase(db, "mover-3", crypto.randomUUID());

    const [player] = await db.select().from(players).where(eq(players.authUserId, "mover-3"));
    const blocked = findNeighbor(world, { x: player!.x!, y: player!.y! }, false);
    if (blocked) {
      await waitForMoveWindow();
      await expect(
        movePlayer(db, "mover-3", { direction: blocked.direction, actionId: crypto.randomUUID() }),
      ).rejects.toMatchObject({ code: "BLOCKED_TILE" });
    }

    await db
      .update(players)
      .set({ x: 0, y: 0, locationType: "FIELD", lastMoveAt: new Date(0), version: player!.version + 1 })
      .where(eq(players.id, player!.id));
    await expect(movePlayer(db, "mover-3", { direction: "west", actionId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "TARGET_OUT_OF_RANGE",
    });
    await expect(movePlayer(db, "mover-3", { direction: "north", actionId: crypto.randomUUID() })).rejects.toMatchObject({
      code: "TARGET_OUT_OF_RANGE",
    });
    await client.close();
  });

  it("replays the same actionId without moving twice", async () => {
    const { db, client, world } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "mover-4", { rng: createSeededRng("move-idem") });
    const neighbor = findNeighbor(world, start.location!, true);
    expect(neighbor).not.toBeNull();
    await departBase(db, "mover-4", crypto.randomUUID());
    await waitForMoveWindow();
    const actionId = crypto.randomUUID();
    const first = await movePlayer(db, "mover-4", { direction: neighbor!.direction, actionId });
    const second = await movePlayer(db, "mover-4", { direction: neighbor!.direction, actionId });
    expect(second.location).toEqual(first.location);
    expect(first.location).toEqual({ type: "FIELD", x: neighbor!.x, y: neighbor!.y });
    await client.close();
  });

  it("rate-limits rapid distinct movement commands", async () => {
    const { db, client, world } = await setupIsolatedGameDb();
    const start = await ensurePlayerProvisioned(db, "mover-5", { rng: createSeededRng("move-rate") });
    const neighbor = findNeighbor(world, start.location!, true);
    expect(neighbor).not.toBeNull();
    await departBase(db, "mover-5", crypto.randomUUID());
    await waitForMoveWindow();
    await movePlayer(db, "mover-5", { direction: neighbor!.direction, actionId: crypto.randomUUID() });
    await expect(
      movePlayer(db, "mover-5", {
        direction: neighbor!.direction === "east" ? "west" : "east",
        actionId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(GameError);
    await client.close();
  });

  it("can enter the base while standing on the home tile", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "mover-6", { rng: createSeededRng("move-enter") });
    await departBase(db, "mover-6", crypto.randomUUID());
    await waitForMoveWindow();
    const entered = await enterBase(db, "mover-6", crypto.randomUUID());
    expect(entered.location?.type).toBe("BASE");
    await client.close();
  });
});
