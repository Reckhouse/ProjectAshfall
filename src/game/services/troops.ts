import { and, eq } from "drizzle-orm";
import { bases, gameActions, playerResources, players, troopStacks } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError } from "@/game/domain/errors";
import type { PlayerSnapshot, TroopType } from "@/game/domain/types";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { loadSnapshot } from "@/game/services/provision";
import { ensureStartingTroops } from "@/game/services/troop-state";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";

async function replayAction(tx: AppTx, playerId: string, actionKey: string): Promise<unknown | "continue"> {
  const [existing] = await tx
    .select()
    .from(gameActions)
    .where(and(eq(gameActions.playerId, playerId), eq(gameActions.actionKey, actionKey)))
    .limit(1);
  if (!existing) {
    return "continue";
  }
  if (existing.status === "COMPLETED") {
    return existing.resultPayload;
  }
  return "continue";
}

export async function recruitTroops(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; unitType: TroopType; count: number },
): Promise<{ player: PlayerSnapshot; recruited: { unitType: TroopType; count: number; metalSpent: number } }> {
  try {
    const result = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
      if (!player || player.status !== "ACTIVE") {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }
      const replayed = await replayAction(tx, player.id, input.actionId);
      if (replayed !== "continue") {
        return replayed as {
          player: PlayerSnapshot;
          recruited: { unitType: TroopType; count: number; metalSpent: number };
        };
      }
      if (player.locationType !== "BASE") {
        throw new GameError("INVALID_COMMAND", "Return to base before recruiting.", 400);
      }
      if (input.unitType !== "OFFENSE" && input.unitType !== "DEFENSE") {
        throw new GameError("INVALID_COMMAND", "Recruit defense or offense troops.", 400);
      }
      if (!Number.isInteger(input.count) || input.count < 1) {
        throw new GameError("INVALID_COMMAND", "Recruit at least one troop.", 400);
      }

      await applyPassiveAccrual(tx, player.id);

      const [base] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).for("update").limit(1);
      if (!base) {
        throw new GameError("PLAYER_NOT_PROVISIONED", "Base is not ready.", 409);
      }
      await ensureStartingTroops(tx, player.id, base.id);

      const [stack] = await tx
        .select()
        .from(troopStacks)
        .where(
          and(
            eq(troopStacks.playerId, player.id),
            eq(troopStacks.locationType, "BASE"),
            eq(troopStacks.locationId, base.id),
            eq(troopStacks.unitType, input.unitType),
          ),
        )
        .for("update")
        .limit(1);
      const current = stack?.quantity ?? 0;
      if (current + input.count > balanceV1.troops.maxPerType) {
        throw new GameError("INVALID_COMMAND", "Troop roster is at capacity.", 400);
      }

      const cost = balanceV1.troops.recruitMetalCost[input.unitType] * input.count;
      const [resources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .for("update")
        .limit(1);
      if (!resources || resources.metal < cost) {
        throw new GameError("INSUFFICIENT_METAL", "Not enough Metal to recruit.", 400);
      }

      await tx
        .update(playerResources)
        .set({
          metal: resources.metal - cost,
          updatedAt: new Date(),
          version: resources.version + 1,
        })
        .where(eq(playerResources.playerId, player.id));

      if (stack) {
        await tx
          .update(troopStacks)
          .set({
            quantity: current + input.count,
            updatedAt: new Date(),
            version: stack.version + 1,
          })
          .where(eq(troopStacks.id, stack.id));
      } else {
        await tx.insert(troopStacks).values({
          id: createId(),
          playerId: player.id,
          locationType: "BASE",
          locationId: base.id,
          unitType: input.unitType,
          quantity: input.count,
        });
      }

      const snapshot = await loadSnapshot(tx, player.id);
      const payload = {
        player: snapshot,
        recruited: { unitType: input.unitType, count: input.count, metalSpent: cost },
      };
      await tx
        .insert(gameActions)
        .values({
          id: createId(),
          playerId: player.id,
          actionKey: input.actionId,
          actionType: "RECRUIT",
          status: "COMPLETED",
          resultCode: "OK",
          resultPayload: payload,
          completedAt: new Date(),
        })
        .onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });

    logEvent({
      event: "troop.recruited",
      authUserId,
      actionId: input.actionId,
      amount: result.recruited.count,
    });
    return result;
  } catch (error) {
    logEvent({
      event: "troop.recruit.failed",
      authUserId,
      actionId: input.actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}
