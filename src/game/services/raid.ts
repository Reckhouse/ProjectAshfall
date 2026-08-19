import { and, eq } from "drizzle-orm";
import { bases, battleReports, gameActions, playerResources, players, raidCooldowns } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError } from "@/game/domain/errors";
import type { PlayerSnapshot } from "@/game/domain/types";
import { applyPassiveAccrual } from "@/game/services/accrual";
import { sameAlliance } from "@/game/services/alliances";
import { resolveCombat, type BattleReport } from "@/game/services/combat";
import { loadSnapshot } from "@/game/services/provision";
import {
  applyBaseDefenseCasualties,
  applyExpeditionCasualties,
  getBaseDefense,
  getExpeditionOffense,
} from "@/game/services/troop-state";
import { chebyshevDistance, storageCaps } from "@/game/world/nodes";
import { createSeededRng } from "@/game/world/rng";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";

export type RaidResult = {
  player: PlayerSnapshot;
  battle: BattleReport;
  loot: { energy: number; metal: number };
  target: { baseId: string; x: number; y: number };
};

export function isNewPlayerProtected(
  createdAt: Date,
  now = new Date(),
  kind: "HUMAN" | "BOT" = "HUMAN",
): boolean {
  if (kind === "BOT") {
    return false;
  }
  return now.getTime() - createdAt.getTime() < balanceV1.pvp.newPlayerProtectionMs;
}

export function cappedLoot(stored: number, lootBps: number, absCap: number): number {
  if (stored <= 0 || lootBps <= 0 || absCap <= 0) {
    return 0;
  }
  return Math.min(stored, absCap, Math.floor((stored * lootBps) / 10_000));
}

function formatRaidSummary(battle: BattleReport, loot: { energy: number; metal: number }): string {
  const lost = `${battle.attackerCasualties} offense lost`;
  if (battle.outcome === "ATTACKER_WIN") {
    return `Raid won. ${battle.attackerCommitted} offense in, ${lost}. Took ${loot.energy} Energy and ${loot.metal} Metal.`;
  }
  return `Raid failed. ${battle.attackerCommitted} offense in, ${lost}.`;
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

async function lockPlayersById(tx: AppTx, leftId: string, rightId: string): Promise<void> {
  const ordered = [leftId, rightId].sort();
  for (const id of ordered) {
    await tx.select().from(players).where(eq(players.id, id)).for("update").limit(1);
  }
}

export async function raidBase(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; targetBaseId: string },
): Promise<RaidResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const [viewer] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
      if (!viewer || viewer.status !== "ACTIVE") {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }

      const replayed = await replayAction(tx, viewer.id, input.actionId);
      if (replayed !== "continue") {
        return replayed as RaidResult;
      }

      const [targetBase] = await tx.select().from(bases).where(eq(bases.id, input.targetBaseId)).limit(1);
      if (!targetBase || targetBase.worldId !== viewer.worldId) {
        throw new GameError("INVALID_COMMAND", "Target base was not found.", 400);
      }
      if (targetBase.playerId === viewer.id) {
        throw new GameError("INVALID_COMMAND", "You cannot raid your own base.", 400);
      }
      if (await sameAlliance(tx, viewer.id, targetBase.playerId)) {
        throw new GameError("ALLIED_TARGET", "You cannot raid an allied bunker.", 400);
      }

      await lockPlayersById(tx, viewer.id, targetBase.playerId);
      const [attacker] = await tx.select().from(players).where(eq(players.id, viewer.id)).limit(1);
      const [defender] = await tx.select().from(players).where(eq(players.id, targetBase.playerId)).limit(1);
      if (!attacker || !defender || attacker.status !== "ACTIVE" || attacker.x === null || attacker.y === null) {
        throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
      }
      if (attacker.locationType !== "FIELD") {
        throw new GameError("INVALID_COMMAND", "Leave base before raiding.", 400);
      }
      if (chebyshevDistance({ x: attacker.x, y: attacker.y }, { x: targetBase.x, y: targetBase.y }) > balanceV1.pvp.raidChebyshevRange) {
        throw new GameError("TARGET_OUT_OF_RANGE", "Move adjacent to that base to raid it.", 400);
      }

      const now = new Date();
      if (isNewPlayerProtected(defender.createdAt, now, defender.kind === "BOT" ? "BOT" : "HUMAN")) {
        throw new GameError("BASE_PROTECTED", "That commander is still under new-player protection.", 400);
      }

      const [cooldown] = await tx
        .select()
        .from(raidCooldowns)
        .where(
          and(
            eq(raidCooldowns.attackerPlayerId, attacker.id),
            eq(raidCooldowns.defenderPlayerId, defender.id),
          ),
        )
        .for("update")
        .limit(1);
      if (cooldown && now.getTime() - cooldown.lastRaidAt.getTime() < balanceV1.pvp.repeatTargetCooldownMs) {
        throw new GameError("RAID_COOLDOWN", "That base was raided too recently.", 400);
      }

      const committed = await getExpeditionOffense(tx, attacker.id);
      if (committed <= 0) {
        throw new GameError("INSUFFICIENT_TROOPS", "Commit offense troops before raiding.", 400);
      }

      await applyPassiveAccrual(tx, attacker.id, now);
      await applyPassiveAccrual(tx, defender.id, now);

      const [attackerResources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, attacker.id))
        .for("update")
        .limit(1);
      const [defenderResources] = await tx
        .select()
        .from(playerResources)
        .where(eq(playerResources.playerId, defender.id))
        .for("update")
        .limit(1);
      if (!attackerResources || !defenderResources) {
        throw new GameError("INTERNAL_GAME_ERROR", "Resource account is missing.", 500);
      }
      if (attackerResources.energy < balanceV1.pvp.raidEnergyCost) {
        throw new GameError("INSUFFICIENT_ENERGY", "Not enough Energy to raid.", 400);
      }

      await tx
        .update(playerResources)
        .set({
          energy: attackerResources.energy - balanceV1.pvp.raidEnergyCost,
          updatedAt: now,
          version: attackerResources.version + 1,
        })
        .where(eq(playerResources.playerId, attacker.id));

      const defenseQty = await getBaseDefense(tx, defender.id, targetBase.id);
      const combatSeed = `${attacker.id}:${defender.id}:${targetBase.id}:${input.actionId}:raid`;
      const battle = resolveCombat({
        attacker: { quantity: committed, powerPerUnit: balanceV1.troops.offenseAttack },
        defender: {
          quantity: Math.max(defenseQty, balanceV1.pvp.minDefensePowerUnits),
          powerPerUnit: balanceV1.troops.defenseDefense,
          modifierBps: balanceV1.combat.baseDefenseModifierBps,
        },
        rng: createSeededRng(combatSeed),
        seed: combatSeed,
      });

      await applyExpeditionCasualties(tx, attacker.id, battle.attackerCasualties);
      await applyBaseDefenseCasualties(tx, defender.id, targetBase.id, Math.min(battle.defenderCasualties, defenseQty));

      let loot = { energy: 0, metal: 0 };
      if (battle.outcome === "ATTACKER_WIN") {
        const attackerBase = await tx.select().from(bases).where(eq(bases.playerId, attacker.id)).limit(1);
        const attackerCaps = storageCaps(attackerBase[0]?.storageLevel ?? 1);
        const freshAttacker = await tx
          .select()
          .from(playerResources)
          .where(eq(playerResources.playerId, attacker.id))
          .limit(1);
        const freshDefender = await tx
          .select()
          .from(playerResources)
          .where(eq(playerResources.playerId, defender.id))
          .limit(1);
        const energyTaken = cappedLoot(freshDefender[0]?.energy ?? 0, balanceV1.pvp.lootBps, balanceV1.pvp.energyLootCap);
        const metalTaken = cappedLoot(freshDefender[0]?.metal ?? 0, balanceV1.pvp.lootBps, balanceV1.pvp.metalLootCap);
        const energyRoom = Math.max(0, attackerCaps.energyCap - (freshAttacker[0]?.energy ?? 0));
        const metalRoom = Math.max(0, attackerCaps.metalCap - (freshAttacker[0]?.metal ?? 0));
        loot = {
          energy: Math.min(energyTaken, energyRoom),
          metal: Math.min(metalTaken, metalRoom),
        };
        await tx
          .update(playerResources)
          .set({
            energy: (freshDefender[0]?.energy ?? 0) - loot.energy,
            metal: (freshDefender[0]?.metal ?? 0) - loot.metal,
            updatedAt: now,
            version: (freshDefender[0]?.version ?? 0) + 1,
          })
          .where(eq(playerResources.playerId, defender.id));
        await tx
          .update(playerResources)
          .set({
            energy: (freshAttacker[0]?.energy ?? 0) + loot.energy,
            metal: (freshAttacker[0]?.metal ?? 0) + loot.metal,
            updatedAt: now,
            version: (freshAttacker[0]?.version ?? 0) + 1,
          })
          .where(eq(playerResources.playerId, attacker.id));
      }

      if (cooldown) {
        await tx
          .update(raidCooldowns)
          .set({ lastRaidAt: now })
          .where(
            and(
              eq(raidCooldowns.attackerPlayerId, attacker.id),
              eq(raidCooldowns.defenderPlayerId, defender.id),
            ),
          );
      } else {
        await tx.insert(raidCooldowns).values({
          attackerPlayerId: attacker.id,
          defenderPlayerId: defender.id,
          lastRaidAt: now,
        });
      }

      const summary = formatRaidSummary(battle, loot);
      const report = { ...battle, summary };
      await tx.insert(battleReports).values({
        id: createId(),
        playerId: attacker.id,
        actionKey: input.actionId,
        kind: "PVP",
        caveId: null,
        defenderPlayerId: defender.id,
        outcome: battle.outcome,
        seed: battle.seed,
        attackerCommitted: battle.attackerCommitted,
        defenderCommitted: battle.defenderCommitted,
        attackerCasualties: battle.attackerCasualties,
        defenderCasualties: battle.defenderCasualties,
        attackerPower: battle.attackerPower,
        defenderPower: battle.defenderPower,
        energyLooted: loot.energy,
        metalLooted: loot.metal,
        report,
      });

      const snapshot = await loadSnapshot(tx, attacker.id);
      const payload: RaidResult = {
        player: snapshot,
        battle: report,
        loot,
        target: { baseId: targetBase.id, x: targetBase.x, y: targetBase.y },
      };
      await tx.insert(gameActions).values({
        id: createId(),
        playerId: attacker.id,
        actionKey: input.actionId,
        actionType: "RAID",
        status: "COMPLETED",
        resultCode: battle.outcome === "ATTACKER_WIN" ? "OK" : "DEFEAT",
        resultPayload: payload,
        completedAt: now,
      }).onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
      return payload;
    });

    logEvent({
      event: "combat.resolved",
      authUserId,
      actionId: input.actionId,
      amount: result.loot.energy + result.loot.metal,
    });
    return result;
  } catch (error) {
    logEvent({
      event: "raid.failed",
      authUserId,
      actionId: input.actionId,
      code: isGameError(error) ? error.code : "INTERNAL_GAME_ERROR",
    });
    throw error;
  }
}
