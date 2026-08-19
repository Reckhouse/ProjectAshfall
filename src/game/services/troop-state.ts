import { and, eq } from "drizzle-orm";
import { expeditions, troopStacks } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type { PlayerSnapshot } from "@/game/domain/types";
import { createId } from "@/lib/ids";

export function emptyTroopSnapshot(): PlayerSnapshot["troops"] {
  return {
    defense: { atBase: 0, deployed: 0 },
    offense: { atBase: 0, deployed: 0 },
  };
}

export function offensePower(quantity: number): number {
  return quantity * balanceV1.troops.offenseAttack;
}

export function caveRequiredPower(tier: number): number {
  const units =
    balanceV1.combat.caveDefenseUnitsByTier[tier as keyof typeof balanceV1.combat.caveDefenseUnitsByTier] ??
    tier * balanceV1.combat.caveDefenseUnitsPerTier;
  const power =
    balanceV1.combat.caveDefensePowerByTier[tier as keyof typeof balanceV1.combat.caveDefensePowerByTier] ??
    balanceV1.troops.cavePowerPerTier;
  return units * power;
}

export async function loadTroopSnapshot(
  tx: AppTx | AppDb,
  playerId: string,
): Promise<{ troops: PlayerSnapshot["troops"]; expedition: PlayerSnapshot["expedition"] }> {
  const stacks = await tx.select().from(troopStacks).where(eq(troopStacks.playerId, playerId));
  const [active] = await tx
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.playerId, playerId), eq(expeditions.status, "ACTIVE")))
    .limit(1);

  const troops = emptyTroopSnapshot();
  for (const stack of stacks) {
    if (stack.unitType === "DEFENSE" && stack.locationType === "BASE") {
      troops.defense.atBase += stack.quantity;
    }
    if (stack.unitType === "OFFENSE" && stack.locationType === "BASE") {
      troops.offense.atBase += stack.quantity;
    }
    if (stack.unitType === "OFFENSE" && stack.locationType === "EXPEDITION") {
      troops.offense.deployed += stack.quantity;
    }
  }

  return {
    troops,
    expedition: active
      ? {
          id: active.id,
          offense: troops.offense.deployed,
          power: offensePower(troops.offense.deployed),
        }
      : null,
  };
}

export async function ensureStartingTroops(tx: AppTx | AppDb, playerId: string, baseId: string): Promise<void> {
  await tx
    .insert(troopStacks)
    .values({
      id: createId(),
      playerId,
      locationType: "BASE",
      locationId: baseId,
      unitType: "DEFENSE",
      quantity: balanceV1.troops.startingDefense,
    })
    .onConflictDoNothing({
      target: [troopStacks.playerId, troopStacks.locationType, troopStacks.locationId, troopStacks.unitType],
    });
  await tx
    .insert(troopStacks)
    .values({
      id: createId(),
      playerId,
      locationType: "BASE",
      locationId: baseId,
      unitType: "OFFENSE",
      quantity: balanceV1.troops.startingOffense,
    })
    .onConflictDoNothing({
      target: [troopStacks.playerId, troopStacks.locationType, troopStacks.locationId, troopStacks.unitType],
    });
}

async function getBaseOffenseStack(tx: AppTx, playerId: string, baseId: string) {
  const [stack] = await tx
    .select()
    .from(troopStacks)
    .where(
      and(
        eq(troopStacks.playerId, playerId),
        eq(troopStacks.locationType, "BASE"),
        eq(troopStacks.locationId, baseId),
        eq(troopStacks.unitType, "OFFENSE"),
      ),
    )
    .for("update")
    .limit(1);
  return stack ?? null;
}

export async function openExpedition(
  tx: AppTx,
  input: { playerId: string; worldId: string; baseId: string; offenseCount?: number },
): Promise<void> {
  const [existing] = await tx
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.playerId, input.playerId), eq(expeditions.status, "ACTIVE")))
    .for("update")
    .limit(1);
  if (existing) {
    throw new GameError("INVALID_COMMAND", "An expedition is already in the field.", 400);
  }

  const homeOffense = await getBaseOffenseStack(tx, input.playerId, input.baseId);
  const available = homeOffense?.quantity ?? 0;
  const taking = input.offenseCount ?? available;
  if (!Number.isInteger(taking) || taking < 0) {
    throw new GameError("INVALID_COMMAND", "Offense assignment must be a whole number.", 400);
  }
  if (taking > available) {
    throw new GameError("INSUFFICIENT_TROOPS", "Not enough offense troops at the base.", 400);
  }

  const expeditionId = createId();
  await tx.insert(expeditions).values({
    id: expeditionId,
    playerId: input.playerId,
    worldId: input.worldId,
    status: "ACTIVE",
  });

  if (taking <= 0 || !homeOffense) {
    return;
  }

  await tx
    .update(troopStacks)
    .set({
      quantity: available - taking,
      updatedAt: new Date(),
      version: homeOffense.version + 1,
    })
    .where(eq(troopStacks.id, homeOffense.id));

  await tx.insert(troopStacks).values({
    id: createId(),
    playerId: input.playerId,
    locationType: "EXPEDITION",
    locationId: expeditionId,
    unitType: "OFFENSE",
    quantity: taking,
  });
}

export async function closeActiveExpedition(tx: AppTx, playerId: string, baseId: string): Promise<void> {
  const [active] = await tx
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.playerId, playerId), eq(expeditions.status, "ACTIVE")))
    .for("update")
    .limit(1);
  if (!active) {
    return;
  }

  const fieldStacks = await tx
    .select()
    .from(troopStacks)
    .where(
      and(eq(troopStacks.playerId, playerId), eq(troopStacks.locationType, "EXPEDITION"), eq(troopStacks.locationId, active.id)),
    )
    .for("update");

  for (const stack of fieldStacks) {
    if (stack.unitType !== "OFFENSE" || stack.quantity <= 0) {
      await tx.delete(troopStacks).where(eq(troopStacks.id, stack.id));
      continue;
    }
    const home = await getBaseOffenseStack(tx, playerId, baseId);
    if (home) {
      await tx
        .update(troopStacks)
        .set({
          quantity: home.quantity + stack.quantity,
          updatedAt: new Date(),
          version: home.version + 1,
        })
        .where(eq(troopStacks.id, home.id));
    } else {
      await tx.insert(troopStacks).values({
        id: createId(),
        playerId,
        locationType: "BASE",
        locationId: baseId,
        unitType: "OFFENSE",
        quantity: stack.quantity,
      });
    }
    await tx.delete(troopStacks).where(eq(troopStacks.id, stack.id));
  }

  await tx
    .update(expeditions)
    .set({
      status: "RETURNED",
      returnedAt: new Date(),
      updatedAt: new Date(),
      version: active.version + 1,
    })
    .where(eq(expeditions.id, active.id));
}

export async function applyExpeditionCasualties(tx: AppTx, playerId: string, casualties: number): Promise<number> {
  const requested = Math.max(0, Math.trunc(casualties));
  const [active] = await tx
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.playerId, playerId), eq(expeditions.status, "ACTIVE")))
    .for("update")
    .limit(1);
  if (!active) {
    throw new GameError("INVALID_COMMAND", "No expedition is in the field.", 400);
  }

  const [stack] = await tx
    .select()
    .from(troopStacks)
    .where(
      and(
        eq(troopStacks.playerId, playerId),
        eq(troopStacks.locationType, "EXPEDITION"),
        eq(troopStacks.locationId, active.id),
        eq(troopStacks.unitType, "OFFENSE"),
      ),
    )
    .for("update")
    .limit(1);
  if (!stack || stack.quantity <= 0 || requested === 0) {
    return 0;
  }

  const killed = Math.min(requested, stack.quantity);
  const remaining = stack.quantity - killed;
  await tx
    .update(troopStacks)
    .set({
      quantity: remaining,
      wounded: Math.min(stack.wounded, remaining),
      updatedAt: new Date(),
      version: stack.version + 1,
    })
    .where(eq(troopStacks.id, stack.id));
  return killed;
}

export async function getExpeditionOffense(tx: AppTx | AppDb, playerId: string): Promise<number> {
  const [active] = await tx
    .select()
    .from(expeditions)
    .where(and(eq(expeditions.playerId, playerId), eq(expeditions.status, "ACTIVE")))
    .limit(1);
  if (!active) {
    return 0;
  }
  const stacks = await tx
    .select()
    .from(troopStacks)
    .where(
      and(
        eq(troopStacks.locationType, "EXPEDITION"),
        eq(troopStacks.locationId, active.id),
        eq(troopStacks.unitType, "OFFENSE"),
      ),
    );
  return stacks.reduce((sum, stack) => sum + stack.quantity, 0);
}

export async function getBaseDefense(tx: AppTx | AppDb, playerId: string, baseId: string): Promise<number> {
  const [stack] = await tx
    .select()
    .from(troopStacks)
    .where(
      and(
        eq(troopStacks.playerId, playerId),
        eq(troopStacks.locationType, "BASE"),
        eq(troopStacks.locationId, baseId),
        eq(troopStacks.unitType, "DEFENSE"),
      ),
    )
    .limit(1);
  return stack?.quantity ?? 0;
}

export async function applyBaseDefenseCasualties(
  tx: AppTx,
  playerId: string,
  baseId: string,
  casualties: number,
): Promise<number> {
  const requested = Math.max(0, Math.trunc(casualties));
  const [stack] = await tx
    .select()
    .from(troopStacks)
    .where(
      and(
        eq(troopStacks.playerId, playerId),
        eq(troopStacks.locationType, "BASE"),
        eq(troopStacks.locationId, baseId),
        eq(troopStacks.unitType, "DEFENSE"),
      ),
    )
    .for("update")
    .limit(1);
  if (!stack || stack.quantity <= 0 || requested === 0) {
    return 0;
  }
  const killed = Math.min(requested, stack.quantity);
  const remaining = stack.quantity - killed;
  await tx
    .update(troopStacks)
    .set({
      quantity: remaining,
      wounded: Math.min(stack.wounded, remaining),
      updatedAt: new Date(),
      version: stack.version + 1,
    })
    .where(eq(troopStacks.id, stack.id));
  return killed;
}
