import { alias } from "drizzle-orm/pg-core";
import { desc, eq, sql } from "drizzle-orm";
import { battleReports, caveClears, caves, gameActions, players, resourceNodes, worlds } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { listBots } from "@/game/services/bots";

export type AdminStats = {
  world: string | null;
  commanders: { humans: number; bots: number };
  gathered: { energy: number; metal: number; collections: number };
  mapNodes: { energyRemaining: number; energyCapacity: number; metalRemaining: number; metalCapacity: number; depleted: number };
  caves: { materialized: number; clears: number; uniqueExplored: number };
  battles: Array<{
    id: string;
    kind: string;
    outcome: string;
    attackerName: string | null;
    defenderName: string | null;
    attackerCasualties: number;
    defenderCasualties: number;
    energyLooted: number;
    metalLooted: number;
    createdAt: string;
  }>;
  bots: Awaited<ReturnType<typeof listBots>>;
};

function asCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

export async function loadAdminStats(db: AppDb): Promise<AdminStats> {
  const [world] = await db.select({ slug: worlds.slug }).from(worlds).where(eq(worlds.status, "ACTIVE")).limit(1);
  const kindRows = await db
    .select({
      kind: players.kind,
      count: sql<number>`count(*)::int`,
    })
    .from(players)
    .where(eq(players.status, "ACTIVE"))
    .groupBy(players.kind);

  const humans = asCount(kindRows.find((row) => row.kind === "HUMAN")?.count);
  const bots = asCount(kindRows.find((row) => row.kind === "BOT")?.count);

  const gatherRows = await db
    .select({
      resource: sql<string>`${gameActions.resultPayload} -> 'collected' ->> 'resource'`,
      amount: sql<number>`coalesce(sum((${gameActions.resultPayload} -> 'collected' ->> 'amount')::int), 0)::int`,
      collections: sql<number>`count(*)::int`,
    })
    .from(gameActions)
    .where(sql`${gameActions.actionType} = 'COLLECT' and ${gameActions.status} = 'COMPLETED'`)
    .groupBy(sql`${gameActions.resultPayload} -> 'collected' ->> 'resource'`);

  const gathered = {
    energy: asCount(gatherRows.find((row) => row.resource === "ENERGY")?.amount),
    metal: asCount(gatherRows.find((row) => row.resource === "METAL")?.amount),
    collections: gatherRows.reduce((sum, row) => sum + asCount(row.collections), 0),
  };

  const [nodeRow] = await db
    .select({
      energyRemaining: sql<number>`coalesce(sum(case when ${resourceNodes.resourceType} = 'ENERGY' then ${resourceNodes.remaining} else 0 end), 0)::int`,
      energyCapacity: sql<number>`coalesce(sum(case when ${resourceNodes.resourceType} = 'ENERGY' then ${resourceNodes.capacity} else 0 end), 0)::int`,
      metalRemaining: sql<number>`coalesce(sum(case when ${resourceNodes.resourceType} = 'METAL' then ${resourceNodes.remaining} else 0 end), 0)::int`,
      metalCapacity: sql<number>`coalesce(sum(case when ${resourceNodes.resourceType} = 'METAL' then ${resourceNodes.capacity} else 0 end), 0)::int`,
      depleted: sql<number>`coalesce(sum(case when ${resourceNodes.remaining} = 0 then 1 else 0 end), 0)::int`,
    })
    .from(resourceNodes);

  const [caveRow] = await db.select({ count: sql<number>`count(*)::int` }).from(caves);
  const [clearRow] = await db.select({ count: sql<number>`count(*)::int` }).from(caveClears);
  const [uniqueCaveRow] = await db
    .select({ count: sql<number>`count(distinct ${caveClears.caveId})::int` })
    .from(caveClears);

  const attacker = alias(players, "attacker");
  const defender = alias(players, "defender");

  const battleRows = await db
    .select({
      id: battleReports.id,
      kind: battleReports.kind,
      outcome: battleReports.outcome,
      attackerName: attacker.displayName,
      defenderName: defender.displayName,
      attackerCasualties: battleReports.attackerCasualties,
      defenderCasualties: battleReports.defenderCasualties,
      energyLooted: battleReports.energyLooted,
      metalLooted: battleReports.metalLooted,
      createdAt: battleReports.createdAt,
    })
    .from(battleReports)
    .leftJoin(attacker, eq(attacker.id, battleReports.playerId))
    .leftJoin(defender, eq(defender.id, battleReports.defenderPlayerId))
    .orderBy(desc(battleReports.createdAt))
    .limit(40);

  return {
    world: world?.slug ?? null,
    commanders: { humans, bots },
    gathered,
    mapNodes: {
      energyRemaining: asCount(nodeRow?.energyRemaining),
      energyCapacity: asCount(nodeRow?.energyCapacity),
      metalRemaining: asCount(nodeRow?.metalRemaining),
      metalCapacity: asCount(nodeRow?.metalCapacity),
      depleted: asCount(nodeRow?.depleted),
    },
    caves: {
      materialized: asCount(caveRow?.count),
      clears: asCount(clearRow?.count),
      uniqueExplored: asCount(uniqueCaveRow?.count),
    },
    battles: battleRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      outcome: row.outcome,
      attackerName: row.attackerName,
      defenderName: row.defenderName,
      attackerCasualties: row.attackerCasualties,
      defenderCasualties: row.defenderCasualties,
      energyLooted: row.energyLooted,
      metalLooted: row.metalLooted,
      createdAt: row.createdAt.toISOString(),
    })),
    bots: await listBots(db),
  };
}
