import { eq } from "drizzle-orm";
import { bases, playerResources } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { accruedUnits, productionRates } from "@/game/world/nodes";
import { logEvent } from "@/lib/logging";

export async function applyPassiveAccrual(tx: AppTx | AppDb, playerId: string, now = new Date()): Promise<void> {
  const [resources] = await tx
    .select()
    .from(playerResources)
    .where(eq(playerResources.playerId, playerId))
    .for("update")
    .limit(1);
  if (!resources) {
    return;
  }
  const [base] = await tx.select().from(bases).where(eq(bases.playerId, playerId)).limit(1);
  const rates = productionRates(base?.level ?? 1);
  const energy = accruedUnits({
    lastAccruedAt: resources.energyAccruedAt,
    perHour: rates.energyPerHour,
    current: resources.energy,
    cap: balanceV1.economy.passive.energyCap,
    now,
  });
  const metal = accruedUnits({
    lastAccruedAt: resources.metalAccruedAt,
    perHour: rates.metalPerHour,
    current: resources.metal,
    cap: balanceV1.economy.passive.metalCap,
    now,
  });
  if (energy.earned === 0 && metal.earned === 0) {
    return;
  }
  await tx
    .update(playerResources)
    .set({
      energy: resources.energy + energy.earned,
      metal: resources.metal + metal.earned,
      energyAccruedAt: energy.nextAccruedAt,
      metalAccruedAt: metal.nextAccruedAt,
      updatedAt: now,
      version: resources.version + 1,
    })
    .where(eq(playerResources.playerId, playerId));
  logEvent({
    event: "resource.accrued",
    playerId,
    amount: energy.earned + metal.earned,
  });
}

export { productionRates };
