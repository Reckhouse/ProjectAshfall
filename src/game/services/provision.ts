import { eq } from "drizzle-orm";
import { bases, gameActions, playerResources, players, toolInstances, worldRegions, worlds } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type { LocationType, PlayerSnapshot, Rng, SpawnRegion, WorldView } from "@/game/domain/types";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { allocateBaseSpawn } from "@/game/services/spawn";
import { ensureStartingTroops, loadTroopSnapshot } from "@/game/services/troop-state";
import { productionRates, storageCaps } from "@/game/world/nodes";
import { createCryptoRng } from "@/game/world/rng";

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

function toRegion(region: typeof worldRegions.$inferSelect): SpawnRegion {
  return {
    id: region.id,
    worldId: region.worldId,
    minX: region.minX,
    maxX: region.maxX,
    minY: region.minY,
    maxY: region.maxY,
    spawnEnabled: region.spawnEnabled,
    spawnWeight: region.spawnWeight,
  };
}

export async function loadSnapshot(tx: AppTx | AppDb, playerId: string): Promise<PlayerSnapshot> {
  const [player] = await tx.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Player record was not found.", 404);
  }

  const [world] = player.worldId
    ? await tx.select().from(worlds).where(eq(worlds.id, player.worldId)).limit(1)
    : [];
  const [base] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).limit(1);
  const [resources] = await tx
    .select()
    .from(playerResources)
    .where(eq(playerResources.playerId, player.id))
    .limit(1);
  const equippedTools = await tx.select().from(toolInstances).where(eq(toolInstances.ownerPlayerId, player.id));
  const energyTool = equippedTools.find((tool) => tool.equippedSlot === "ENERGY");
  const metalTool = equippedTools.find((tool) => tool.equippedSlot === "METAL");
  const troopView = await loadTroopSnapshot(tx, player.id);

  return {
    status: player.status as PlayerSnapshot["status"],
    world: world?.slug ?? null,
    base: base
      ? {
          x: base.x,
          y: base.y,
          status: "ESTABLISHED",
          level: base.level,
          storageLevel: base.storageLevel,
        }
      : null,
    resources: resources
      ? {
          energy: resources.energy,
          metal: resources.metal,
          ...storageCaps(base?.storageLevel ?? 1),
          ...productionRates(base?.level ?? 1),
        }
      : null,
    location:
      player.x !== null && player.y !== null
        ? {
            type: player.locationType as LocationType,
            x: player.x,
            y: player.y,
          }
        : null,
    tools: {
      energy: energyTool
        ? { tier: energyTool.tier, bonusBps: energyTool.collectionBonusBps }
        : null,
      metal: metalTool
        ? { tier: metalTool.tier, bonusBps: metalTool.collectionBonusBps }
        : null,
    },
    troops: troopView.troops,
    expedition: troopView.expedition,
  };
}

async function recordAction(
  tx: AppTx,
  input: {
    playerId: string;
    actionKey: string;
    actionType: string;
    status: "STARTED" | "COMPLETED" | "FAILED";
    resultCode?: string;
    resultPayload?: unknown;
  },
): Promise<void> {
  await tx
    .insert(gameActions)
    .values({
      id: createId(),
      playerId: input.playerId,
      actionKey: input.actionKey,
      actionType: input.actionType,
      status: input.status,
      resultCode: input.resultCode,
      resultPayload: input.resultPayload ?? null,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
    })
    .onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
}

export async function ensurePlayerProvisioned(
  db: AppDb,
  authUserId: string,
  options?: { actionId?: string; rng?: Rng },
): Promise<PlayerSnapshot> {
  const rng = options?.rng ?? createCryptoRng();
  const startedAt = Date.now();
  logEvent({ event: "player.provision.started", authUserId, actionId: options?.actionId });

  try {
    const snapshot = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(players)
        .where(eq(players.authUserId, authUserId))
        .for("update")
        .limit(1);

      let player = existing;
      if (!player) {
        const id = createId();
        await tx
          .insert(players)
          .values({
            id,
            authUserId,
            status: "PROVISIONING",
          })
          .onConflictDoNothing({ target: players.authUserId });
        const [created] = await tx
          .select()
          .from(players)
          .where(eq(players.authUserId, authUserId))
          .for("update")
          .limit(1);
        if (!created) {
          throw new GameError("CONFLICT_RETRY", "Player create raced. Retry.", 409);
        }
        player = created;
      }

      if (player.status === "SUSPENDED") {
        throw new GameError("PLAYER_NOT_ACTIVE", "This commander is suspended.", 403);
      }

      const [activeWorld] = await tx.select().from(worlds).where(eq(worlds.status, "ACTIVE")).limit(1);
      if (!activeWorld) {
        throw new GameError("INTERNAL_GAME_ERROR", "No active world is configured.", 500);
      }

      if (!player.worldId) {
        await tx
          .update(players)
          .set({
            worldId: activeWorld.id,
            updatedAt: new Date(),
            version: player.version + 1,
          })
          .where(eq(players.id, player.id));
        player = { ...player, worldId: activeWorld.id, version: player.version + 1 };
      }

      const [existingBase] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).limit(1);
      if (!existingBase) {
        const regions = (await tx.select().from(worldRegions).where(eq(worldRegions.worldId, activeWorld.id))).map(
          toRegion,
        );
        await allocateBaseSpawn({
          db: tx,
          world: toWorldView(activeWorld),
          regions,
          playerId: player.id,
          rng,
        });
      }

      const [existingResources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .limit(1);

      if (!existingResources) {
        await tx
          .insert(playerResources)
          .values({
            playerId: player.id,
            energy: balanceV1.startingResources.energy,
            metal: balanceV1.startingResources.metal,
          })
          .onConflictDoNothing({ target: playerResources.playerId });
      }

      const [establishedBase] = await tx.select().from(bases).where(eq(bases.playerId, player.id)).limit(1);
      if (establishedBase) {
        await ensureStartingTroops(tx, player.id, establishedBase.id);
      }
      const locationPatch: {
        locationType?: string;
        x?: number;
        y?: number;
      } = {};
      if (establishedBase && (player.x === null || player.y === null)) {
        locationPatch.x = player.x ?? establishedBase.x;
        locationPatch.y = player.y ?? establishedBase.y;
        locationPatch.locationType = player.locationType || "BASE";
      }

      if (player.status !== "ACTIVE" || Object.keys(locationPatch).length > 0) {
        await tx
          .update(players)
          .set({
            status: "ACTIVE",
            updatedAt: new Date(),
            version: player.version + 1,
            ...locationPatch,
          })
          .where(eq(players.id, player.id));
      }

      if (options?.actionId) {
        await recordAction(tx, {
          playerId: player.id,
          actionKey: options.actionId,
          actionType: "PROVISION",
          status: "COMPLETED",
          resultCode: "OK",
        });
      }

      await applyPassiveAccrual(tx, player.id);
      return loadSnapshot(tx, player.id);
    });

    logEvent({
      event: "player.provision.completed",
      authUserId,
      actionId: options?.actionId,
      latencyMs: Date.now() - startedAt,
      balanceVersion: balanceV1.version,
    });
    return snapshot;
  } catch (error) {
    logEvent({
      event: "player.provision.failed",
      authUserId,
      actionId: options?.actionId,
      code: error instanceof GameError ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}

export async function getPlayerSnapshot(db: AppDb, authUserId: string): Promise<PlayerSnapshot | null> {
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player) {
    return null;
  }
  await applyPassiveAccrual(db, player.id);
  return loadSnapshot(db, player.id);
}
