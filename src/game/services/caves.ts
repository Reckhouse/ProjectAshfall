import { and, eq, gte, lte } from "drizzle-orm";
import { caveClears, caves, gameActions, playerResources, players, toolInstances, worldFeatures, battleReports } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError } from "@/game/domain/errors";
import type { PlayerSnapshot, ResourceKind, WorldView } from "@/game/domain/types";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { loadSnapshot } from "@/game/services/provision";
import { caveCandidatesInChunk, caveEnergyCost, pickToolAffinity } from "@/game/world/caves";
import { chebyshevDistance, collectionBonusBps } from "@/game/world/nodes";
import { applyExpeditionCasualties, caveRequiredPower, getExpeditionOffense } from "@/game/services/troop-state";
import { resolveCombat, type BattleReport } from "@/game/services/combat";
import { createSeededRng } from "@/game/world/rng";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";

export async function materializeChunkCaves(db: AppDb | AppTx, world: WorldView, chunkX: number, chunkY: number) {
  const candidates = caveCandidatesInChunk(world, chunkX, chunkY);
  for (const candidate of candidates) {
    await db
      .insert(worldFeatures)
      .values({
        id: createId(),
        worldId: world.id,
        chunkX: candidate.chunkX,
        chunkY: candidate.chunkY,
        featureType: "CAVE",
        x: candidate.x,
        y: candidate.y,
        generationVersion: world.generationVersion,
      })
      .onConflictDoNothing({ target: [worldFeatures.worldId, worldFeatures.x, worldFeatures.y] });
  }

  const features = await db
    .select()
    .from(worldFeatures)
    .where(and(eq(worldFeatures.worldId, world.id), eq(worldFeatures.chunkX, chunkX), eq(worldFeatures.chunkY, chunkY)));

  for (const feature of features) {
    if (feature.featureType !== "CAVE") {
      continue;
    }
    await db
      .insert(caves)
      .values({
        featureId: feature.id,
        tier: balanceV1.economy.caves.starterTier,
      })
      .onConflictDoNothing({ target: caves.featureId });
  }
}

export async function listCavesInBounds(
  db: AppDb | AppTx,
  input: {
    worldId: string;
    playerId: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  },
) {
  const rows = await db
    .select({
      id: worldFeatures.id,
      x: worldFeatures.x,
      y: worldFeatures.y,
      tier: caves.tier,
      clearId: caveClears.id,
    })
    .from(worldFeatures)
    .innerJoin(caves, eq(caves.featureId, worldFeatures.id))
    .leftJoin(caveClears, and(eq(caveClears.caveId, caves.featureId), eq(caveClears.playerId, input.playerId)))
    .where(
      and(
        eq(worldFeatures.worldId, input.worldId),
        gte(worldFeatures.x, input.minX),
        lte(worldFeatures.x, input.maxX),
        gte(worldFeatures.y, input.minY),
        lte(worldFeatures.y, input.maxY),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    x: row.x,
    y: row.y,
    tier: row.tier,
    cleared: Boolean(row.clearId),
  }));
}

export async function equippedToolBonus(
  tx: AppTx | AppDb,
  playerId: string,
  resource: ResourceKind,
): Promise<number> {
  const [tool] = await tx
    .select()
    .from(toolInstances)
    .where(and(eq(toolInstances.ownerPlayerId, playerId), eq(toolInstances.equippedSlot, resource)))
    .limit(1);
  return tool?.collectionBonusBps ?? 0;
}

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

export type ClearCaveResult = {
  player: PlayerSnapshot;
  battle: BattleReport;
  cave: { id: string; tier: number };
  tool: { affinity: ResourceKind; tier: number; bonusBps: number; equipped: boolean } | null;
};

export async function clearCave(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; caveId: string },
): Promise<ClearCaveResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
      if (!player || player.status !== "ACTIVE" || player.x === null || player.y === null) {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }

      const replayed = await replayAction(tx, player.id, input.actionId);
      if (replayed !== "continue") {
        return replayed as ClearCaveResult;
      }

      await applyPassiveAccrual(tx, player.id);

      const [feature] = await tx.select().from(worldFeatures).where(eq(worldFeatures.id, input.caveId)).limit(1);
      const [cave] = await tx.select().from(caves).where(eq(caves.featureId, input.caveId)).limit(1);
      if (!feature || !cave || feature.worldId !== player.worldId || feature.featureType !== "CAVE") {
        throw new GameError("INVALID_COMMAND", "Cave was not found.", 400);
      }
      if (chebyshevDistance({ x: player.x, y: player.y }, { x: feature.x, y: feature.y }) > balanceV1.economy.caves.collectChebyshevRange) {
        throw new GameError("TARGET_OUT_OF_RANGE", "Move closer to clear that cave.", 400);
      }

      const [already] = await tx
        .select()
        .from(caveClears)
        .where(and(eq(caveClears.playerId, player.id), eq(caveClears.caveId, cave.featureId)))
        .limit(1);
      if (already) {
        throw new GameError("CAVE_ALREADY_CLEARED", "You already cleared that cave.", 400);
      }

      const committed = await getExpeditionOffense(tx, player.id);
      if (committed <= 0) {
        throw new GameError(
          "INSUFFICIENT_TROOPS",
          `Commit at least ${Math.ceil(caveRequiredPower(cave.tier) / balanceV1.troops.offenseAttack)} offense troops to clear this cave.`,
          400,
        );
      }

      const energyCost = caveEnergyCost(cave.tier);
      const [resources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, player.id))
        .for("update")
        .limit(1);
      if (!resources || resources.energy < energyCost) {
        throw new GameError("INSUFFICIENT_ENERGY", "Not enough Energy to clear that cave.", 400);
      }

      await tx
        .update(playerResources)
        .set({
          energy: resources.energy - energyCost,
          updatedAt: new Date(),
          version: resources.version + 1,
        })
        .where(eq(playerResources.playerId, player.id));

      const combatSeed = `${feature.worldId}:${cave.featureId}:${player.id}:${input.actionId}:combat`;
      const battle = resolveCombat({
        attacker: { quantity: committed, powerPerUnit: balanceV1.troops.offenseAttack },
        defender: {
          quantity: cave.tier * balanceV1.combat.caveDefenseUnitsPerTier,
          powerPerUnit: balanceV1.troops.cavePowerPerTier,
        },
        rng: createSeededRng(combatSeed),
        seed: combatSeed,
      });
      await applyExpeditionCasualties(tx, player.id, battle.attackerCasualties);

      let tool: ClearCaveResult["tool"] = null;
      if (battle.outcome === "ATTACKER_WIN") {
        const equipped = await tx.select().from(toolInstances).where(eq(toolInstances.ownerPlayerId, player.id));
        const energyTool = equipped.find((entry) => entry.equippedSlot === "ENERGY");
        const metalTool = equipped.find((entry) => entry.equippedSlot === "METAL");
        const rng = createSeededRng(`${feature.worldId}:${cave.featureId}:${player.id}:tool`);
        const affinity = pickToolAffinity({
          energyTier: energyTool?.tier ?? 0,
          metalTier: metalTool?.tier ?? 0,
          roll: rng.nextInt(0, 100),
        });
        const tier = cave.tier;
        const bonusBps = collectionBonusBps(tier);
        const currentEquipped = affinity === "ENERGY" ? energyTool : metalTool;
        const shouldEquip = !currentEquipped || tier > currentEquipped.tier;
        const toolId = createId();

        if (shouldEquip && currentEquipped) {
          await tx
            .update(toolInstances)
            .set({ equippedSlot: null })
            .where(eq(toolInstances.id, currentEquipped.id));
        }

        await tx.insert(toolInstances).values({
          id: toolId,
          ownerPlayerId: player.id,
          resourceAffinity: affinity,
          tier,
          collectionBonusBps: bonusBps,
          equippedSlot: shouldEquip ? affinity : null,
        });

        await tx.insert(caveClears).values({
          id: createId(),
          caveId: cave.featureId,
          playerId: player.id,
          rewardVersion: 1,
          toolId,
        });

        tool = { affinity, tier, bonusBps, equipped: shouldEquip };
      }

      await tx.insert(battleReports).values({
        id: createId(),
        playerId: player.id,
        actionKey: input.actionId,
        kind: "CAVE",
        caveId: cave.featureId,
        defenderPlayerId: null,
        outcome: battle.outcome,
        seed: battle.seed,
        attackerCommitted: battle.attackerCommitted,
        defenderCommitted: battle.defenderCommitted,
        attackerCasualties: battle.attackerCasualties,
        defenderCasualties: battle.defenderCasualties,
        attackerPower: battle.attackerPower,
        defenderPower: battle.defenderPower,
        energyLooted: 0,
        metalLooted: 0,
        report: battle,
      });

      const snapshot = await loadSnapshot(tx, player.id);
      const payload: ClearCaveResult = {
        player: snapshot,
        battle,
        cave: { id: cave.featureId, tier: cave.tier },
        tool,
      };
      await tx
        .insert(gameActions)
        .values({
          id: createId(),
          playerId: player.id,
          actionKey: input.actionId,
          actionType: "CLEAR_CAVE",
          status: "COMPLETED",
          resultCode: battle.outcome === "ATTACKER_WIN" ? "OK" : "DEFEAT",
          resultPayload: payload,
          completedAt: new Date(),
        })
        .onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });

    logEvent({
      event: result.battle.outcome === "ATTACKER_WIN" ? "cave.cleared" : "combat.resolved",
      authUserId,
      actionId: input.actionId,
      amount: result.battle.attackerCasualties,
    });
    return result;
  } catch (error) {
    logEvent({
      event: "cave.clear.failed",
      authUserId,
      actionId: input.actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}
