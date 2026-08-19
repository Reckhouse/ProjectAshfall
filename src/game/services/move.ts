import { and, eq } from "drizzle-orm";
import { bases, gameActions, players, worlds } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError, type GameErrorCode } from "@/game/domain/errors";
import type { Direction, PlayerSnapshot, WorldView } from "@/game/domain/types";
import { loadSnapshot } from "@/game/services/provision";
import { closeActiveExpedition, ensureStartingTroops, openExpedition } from "@/game/services/troop-state";
import { DIRECTIONS, offsetCoordinate } from "@/game/world/directions";
import { isInWorldBounds, isPassable } from "@/game/world/terrain";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";

const ACTION_TYPES = {
  move: "MOVE",
  depart: "DEPART",
  enterBase: "ENTER_BASE",
} as const;

type StoredActionResult =
  | { ok: true; player: PlayerSnapshot }
  | { ok: false; code: GameErrorCode; message: string; status: number };

function toWorldView(world: typeof worlds.$inferSelect): WorldView {
  return {
    id: world.id,
    slug: world.slug,
    seed: world.seed,
    generationVersion: world.generationVersion,
    width: world.width,
    height: world.height,
  };
}

function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

function asStoredResult(value: unknown): StoredActionResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as StoredActionResult;
  if (record.ok === true && record.player) {
    return record;
  }
  if (record.ok === false && record.code && record.message && typeof record.status === "number") {
    return record;
  }
  return null;
}

function assertMoveInterval(lastMoveAt: Date | null): void {
  if (!lastMoveAt) {
    return;
  }
  if (Date.now() - lastMoveAt.getTime() < balanceV1.movement.minIntervalMs) {
    throw new GameError("RATE_LIMITED", "Movement is too frequent.", 429);
  }
}

async function completeAction(
  tx: AppTx,
  input: {
    playerId: string;
    actionKey: string;
    actionType: string;
    result: StoredActionResult;
  },
): Promise<void> {
  const now = new Date();
  await tx
    .update(gameActions)
    .set({
      status: input.result.ok ? "COMPLETED" : "FAILED",
      resultCode: input.result.ok ? "OK" : input.result.code,
      resultPayload: input.result,
      completedAt: now,
    })
    .where(and(eq(gameActions.playerId, input.playerId), eq(gameActions.actionKey, input.actionKey)));
}

async function startAction(
  tx: AppTx,
  input: { playerId: string; actionKey: string; actionType: string },
): Promise<void> {
  await tx
    .insert(gameActions)
    .values({
      id: createId(),
      playerId: input.playerId,
      actionKey: input.actionKey,
      actionType: input.actionType,
      status: "STARTED",
    })
    .onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
}

async function replayOrContinue(
  tx: AppTx,
  playerId: string,
  actionKey: string,
): Promise<PlayerSnapshot | "continue"> {
  const [existing] = await tx
    .select()
    .from(gameActions)
    .where(and(eq(gameActions.playerId, playerId), eq(gameActions.actionKey, actionKey)))
    .limit(1);
  if (!existing) {
    return "continue";
  }

  const stored = asStoredResult(existing.resultPayload);
  if (existing.status === "COMPLETED" && stored?.ok) {
    return stored.player;
  }
  if (existing.status === "FAILED" && stored && !stored.ok) {
    throw new GameError(stored.code, stored.message, stored.status);
  }
  return "continue";
}

async function lockActivePlayer(tx: AppTx, authUserId: string) {
  const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
  if (!player || player.status !== "ACTIVE" || !player.worldId) {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }

  const [world] = await tx.select().from(worlds).where(eq(worlds.id, player.worldId)).limit(1);
  if (!world) {
    throw new GameError("INTERNAL_GAME_ERROR", "Active world was not found.", 500);
  }

  const [base] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).limit(1);
  if (!base || player.x === null || player.y === null) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Base location is not ready.", 409);
  }

  return { player, world, base, worldView: toWorldView(world) };
}

async function writePlayerLocation(
  tx: AppTx,
  player: typeof players.$inferSelect,
  patch: { locationType: "BASE" | "FIELD"; x: number; y: number },
): Promise<void> {
  const now = new Date();
  const updated = await tx
    .update(players)
    .set({
      locationType: patch.locationType,
      x: patch.x,
      y: patch.y,
      lastMoveAt: now,
      updatedAt: now,
      version: player.version + 1,
    })
    .where(and(eq(players.id, player.id), eq(players.version, player.version)))
    .returning({ id: players.id });
  if (updated.length === 0) {
    throw new GameError("CONFLICT_RETRY", "Location update raced. Retry.", 409);
  }
}

async function runLocationCommand(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; actionType: string },
  apply: (ctx: Awaited<ReturnType<typeof lockActivePlayer>> & { tx: AppTx }) => Promise<void>,
): Promise<PlayerSnapshot> {
  const startedAt = Date.now();
  logEvent({
    event: "player.command.started",
    authUserId,
    actionId: input.actionId,
    commandType: input.actionType,
  });

  try {
    const snapshot = await db.transaction(async (tx) => {
      const ctx = await lockActivePlayer(tx, authUserId);
      const replayed = await replayOrContinue(tx, ctx.player.id, input.actionId);
      if (replayed !== "continue") {
        return replayed;
      }

      assertMoveInterval(ctx.player.lastMoveAt);
      await startAction(tx, {
        playerId: ctx.player.id,
        actionKey: input.actionId,
        actionType: input.actionType,
      });

      await apply({ ...ctx, tx });
      const player = await loadSnapshot(tx, ctx.player.id);
      await completeAction(tx, {
        playerId: ctx.player.id,
        actionKey: input.actionId,
        actionType: input.actionType,
        result: { ok: true, player },
      });
      return player;
    });

    logEvent({
      event: "player.command.completed",
      authUserId,
      actionId: input.actionId,
      commandType: input.actionType,
      latencyMs: Date.now() - startedAt,
      balanceVersion: balanceV1.version,
    });
    return snapshot;
  } catch (error) {
    logEvent({
      event: "player.command.failed",
      authUserId,
      actionId: input.actionId,
      commandType: input.actionType,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}

export async function departBase(
  db: AppDb,
  authUserId: string,
  actionId: string,
  offenseCount?: number,
): Promise<PlayerSnapshot> {
  return runLocationCommand(db, authUserId, { actionId, actionType: ACTION_TYPES.depart }, async (ctx) => {
    if (ctx.player.locationType !== "BASE") {
      throw new GameError("INVALID_COMMAND", "Commander is already in the field.", 400);
    }
    await ensureStartingTroops(ctx.tx, ctx.player.id, ctx.base.id);
    await openExpedition(ctx.tx, {
      playerId: ctx.player.id,
      worldId: ctx.world.id,
      baseId: ctx.base.id,
      offenseCount,
    });
    await writePlayerLocation(ctx.tx, ctx.player, {
      locationType: "FIELD",
      x: ctx.player.x!,
      y: ctx.player.y!,
    });
  });
}

export async function enterBase(
  db: AppDb,
  authUserId: string,
  actionId: string,
): Promise<PlayerSnapshot> {
  return runLocationCommand(db, authUserId, { actionId, actionType: ACTION_TYPES.enterBase }, async (ctx) => {
    if (ctx.player.locationType !== "FIELD") {
      throw new GameError("INVALID_COMMAND", "Commander is already inside the base.", 400);
    }
    if (ctx.player.x !== ctx.base.x || ctx.player.y !== ctx.base.y) {
      throw new GameError("INVALID_COMMAND", "Walk onto your base tile to enter.", 400);
    }
    await closeActiveExpedition(ctx.tx, ctx.player.id, ctx.base.id);
    await writePlayerLocation(ctx.tx, ctx.player, {
      locationType: "BASE",
      x: ctx.base.x,
      y: ctx.base.y,
    });
  });
}

export async function movePlayer(
  db: AppDb,
  authUserId: string,
  input: { direction: string; actionId: string },
): Promise<PlayerSnapshot> {
  return runLocationCommand(db, authUserId, { actionId: input.actionId, actionType: ACTION_TYPES.move }, async (ctx) => {
    if (ctx.player.locationType !== "FIELD") {
      throw new GameError("INVALID_COMMAND", "Leave the base before moving.", 400);
    }
    if (!isDirection(input.direction)) {
      throw new GameError("INVALID_COMMAND", "Movement must be a cardinal direction.", 400);
    }

    const origin = { x: ctx.player.x!, y: ctx.player.y! };
    const target = offsetCoordinate(origin, input.direction);
    if (!isInWorldBounds(ctx.worldView, target.x, target.y)) {
      throw new GameError("TARGET_OUT_OF_RANGE", "That tile is outside the world.", 400);
    }
    if (!isPassable(ctx.worldView, target.x, target.y)) {
      throw new GameError("BLOCKED_TILE", "That tile is blocked.", 400);
    }

    const onOwnBase = target.x === ctx.base.x && target.y === ctx.base.y;
    if (onOwnBase) {
      await closeActiveExpedition(ctx.tx, ctx.player.id, ctx.base.id);
    }
    await writePlayerLocation(ctx.tx, ctx.player, {
      locationType: onOwnBase ? "BASE" : "FIELD",
      x: target.x,
      y: target.y,
    });
  });
}
