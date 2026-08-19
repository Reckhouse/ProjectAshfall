import { and, eq } from "drizzle-orm";
import { bases, gameActions, playerResources, players, resourceNodes, worldFeatures } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError } from "@/game/domain/errors";
import type { PlayerSnapshot, ResourceKind } from "@/game/domain/types";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { equippedToolBonus } from "@/game/services/caves";
import { loadSnapshot } from "@/game/services/provision";
import { applyCollectionBonus, baseUpgradeMetalCost, chebyshevDistance, storageCaps, storageUpgradeMetalCost } from "@/game/world/nodes";
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

export async function collectResource(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; nodeId: string },
): Promise<{ player: PlayerSnapshot; collected: { resource: ResourceKind; amount: number } }> {
  try {
    const result = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
      if (!player || player.status !== "ACTIVE" || player.x === null || player.y === null) {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }

      const replayed = await replayAction(tx, player.id, input.actionId);
      if (replayed !== "continue") {
        return replayed as { player: PlayerSnapshot; collected: { resource: ResourceKind; amount: number } };
      }

      await applyPassiveAccrual(tx, player.id);

      const [feature] = await tx.select().from(worldFeatures).where(eq(worldFeatures.id, input.nodeId)).limit(1);
      const [node] = await tx
        .select()
        .from(resourceNodes)
        .where(eq(resourceNodes.featureId, input.nodeId))
        .for("update")
        .limit(1);
      if (!feature || !node || feature.worldId !== player.worldId) {
        throw new GameError("INVALID_COMMAND", "Resource node was not found.", 400);
      }
      if (chebyshevDistance({ x: player.x, y: player.y }, { x: feature.x, y: feature.y }) > balanceV1.economy.nodes.collectChebyshevRange) {
        throw new GameError("TARGET_OUT_OF_RANGE", "Move closer to collect that node.", 400);
      }
      if (node.remaining <= 0) {
        throw new GameError("INVALID_COMMAND", "That node is depleted.", 400);
      }

      const amount = node.remaining;
      const resource = node.resourceType as ResourceKind;
      await tx
        .update(resourceNodes)
        .set({ remaining: 0, updatedAt: new Date(), version: node.version + 1 })
        .where(eq(resourceNodes.featureId, node.featureId));

      const [resources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .for("update")
        .limit(1);
      if (!resources) {
        throw new GameError("INTERNAL_GAME_ERROR", "Resource account is missing.", 500);
      }
      const [storageBase] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).limit(1);
      const caps = storageCaps(storageBase?.storageLevel ?? 1);
      const cap = resource === "ENERGY" ? caps.energyCap : caps.metalCap;
      const current = resource === "ENERGY" ? resources.energy : resources.metal;
      const bonusBps = await equippedToolBonus(tx, player.id, resource);
      const yielded = applyCollectionBonus(amount, bonusBps);
      const granted = Math.min(yielded, Math.max(0, cap - current));
      await tx
        .update(playerResources)
        .set({
          energy: resource === "ENERGY" ? current + granted : resources.energy,
          metal: resource === "METAL" ? current + granted : resources.metal,
          updatedAt: new Date(),
          version: resources.version + 1,
        })
        .where(eq(playerResources.playerId, player.id));

      const snapshot = await loadSnapshot(tx, player.id);
      const payload = { player: snapshot, collected: { resource, amount: granted } };
      await tx.insert(gameActions).values({
        id: createId(),
        playerId: player.id,
        actionKey: input.actionId,
        actionType: "COLLECT",
        status: "COMPLETED",
        resultCode: "OK",
        resultPayload: payload,
        completedAt: new Date(),
      }).onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });

    logEvent({
      event: "resource.collected",
      authUserId,
      actionId: input.actionId,
      amount: result.collected.amount,
    });
    return result;
  } catch (error) {
    logEvent({
      event: "resource.collect.failed",
      authUserId,
      actionId: input.actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}

export async function upgradeBase(
  db: AppDb,
  authUserId: string,
  actionId: string,
): Promise<{ player: PlayerSnapshot; upgrade: { level: number; metalSpent: number } }> {
  try {
    const result = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
      if (!player || player.status !== "ACTIVE") {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }
      const replayed = await replayAction(tx, player.id, actionId);
      if (replayed !== "continue") {
        return replayed as { player: PlayerSnapshot; upgrade: { level: number; metalSpent: number } };
      }
      if (player.locationType !== "BASE") {
        throw new GameError("INVALID_COMMAND", "Return to base before upgrading.", 400);
      }

      await applyPassiveAccrual(tx, player.id);

      const [base] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).for("update").limit(1);
      if (!base) {
        throw new GameError("PLAYER_NOT_PROVISIONED", "Base is not ready.", 409);
      }
      if (base.level >= balanceV1.economy.upgrades.base.maxLevel) {
        throw new GameError("INVALID_COMMAND", "Base is already at maximum level.", 400);
      }

      const cost = baseUpgradeMetalCost(base.level);
      if (cost === null) {
        throw new GameError("INVALID_COMMAND", "Base is already at maximum level.", 400);
      }
      const [resources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .for("update")
        .limit(1);
      if (!resources || resources.metal < cost) {
        throw new GameError("INSUFFICIENT_METAL", "Not enough Metal to upgrade the base.", 400);
      }

      await tx
        .update(playerResources)
        .set({
          metal: resources.metal - cost,
          updatedAt: new Date(),
          version: resources.version + 1,
        })
        .where(eq(playerResources.playerId, player.id));
      await tx
        .update(bases)
        .set({
          level: base.level + 1,
          updatedAt: new Date(),
          version: base.version + 1,
        })
        .where(eq(bases.id, base.id));

      const snapshot = await loadSnapshot(tx, player.id);
      const payload = { player: snapshot, upgrade: { level: base.level + 1, metalSpent: cost } };
      await tx.insert(gameActions).values({
        id: createId(),
        playerId: player.id,
        actionKey: actionId,
        actionType: "UPGRADE_BASE",
        status: "COMPLETED",
        resultCode: "OK",
        resultPayload: payload,
        completedAt: new Date(),
      }).onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });
    logEvent({ event: "base.upgraded", authUserId, actionId, amount: result.upgrade.metalSpent });
    return result;
  } catch (error) {
    logEvent({
      event: "base.upgrade.failed",
      authUserId,
      actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}

export async function upgradeStorage(
  db: AppDb,
  authUserId: string,
  actionId: string,
): Promise<{ player: PlayerSnapshot; storage: { level: number; metalSpent: number; energyCap: number; metalCap: number } }> {
  try {
    const result = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
      if (!player || player.status !== "ACTIVE") {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }
      const replayed = await replayAction(tx, player.id, actionId);
      if (replayed !== "continue") {
        return replayed as {
          player: PlayerSnapshot;
          storage: { level: number; metalSpent: number; energyCap: number; metalCap: number };
        };
      }
      if (player.locationType !== "BASE") {
        throw new GameError("INVALID_COMMAND", "Return to base before upgrading storage.", 400);
      }

      await applyPassiveAccrual(tx, player.id);

      const [base] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).for("update").limit(1);
      if (!base) {
        throw new GameError("PLAYER_NOT_PROVISIONED", "Base is not ready.", 409);
      }
      if (base.storageLevel >= balanceV1.economy.upgrades.storage.maxLevel) {
        throw new GameError("INVALID_COMMAND", "Storage is already at maximum level.", 400);
      }

      const cost = storageUpgradeMetalCost(base.storageLevel);
      if (cost === null) {
        throw new GameError("INVALID_COMMAND", "Storage is already at maximum level.", 400);
      }
      const [resources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .for("update")
        .limit(1);
      if (!resources || resources.metal < cost) {
        throw new GameError("INSUFFICIENT_METAL", "Not enough Metal to upgrade storage.", 400);
      }

      await tx
        .update(playerResources)
        .set({
          metal: resources.metal - cost,
          updatedAt: new Date(),
          version: resources.version + 1,
        })
        .where(eq(playerResources.playerId, player.id));
      await tx
        .update(bases)
        .set({
          storageLevel: base.storageLevel + 1,
          updatedAt: new Date(),
          version: base.version + 1,
        })
        .where(eq(bases.id, base.id));

      const snapshot = await loadSnapshot(tx, player.id);
      const caps = storageCaps(base.storageLevel + 1);
      const payload = {
        player: snapshot,
        storage: { level: base.storageLevel + 1, metalSpent: cost, energyCap: caps.energyCap, metalCap: caps.metalCap },
      };
      await tx.insert(gameActions).values({
        id: createId(),
        playerId: player.id,
        actionKey: actionId,
        actionType: "UPGRADE_STORAGE",
        status: "COMPLETED",
        resultCode: "OK",
        resultPayload: payload,
        completedAt: new Date(),
      }).onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });
    logEvent({ event: "storage.upgraded", authUserId, actionId, amount: result.storage.metalSpent });
    return result;
  } catch (error) {
    logEvent({
      event: "storage.upgrade.failed",
      authUserId,
      actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}
