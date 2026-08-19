import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { bases, battleReports, caveClears, players, worlds } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import type { PlayerKind, RaidIntel, StandingEntry, WorldStandings } from "@/game/domain/types";

export type StandingInputs = {
  baseLevel: number;
  storageLevel: number;
  raidWins: number;
  caveClears: number;
  energyLooted: number;
  metalLooted: number;
};

type RankedCandidate = StandingInputs & {
  playerId: string;
  authUserId: string;
  callsign: string;
  kind: PlayerKind;
};

export function standingScore(
  input: StandingInputs,
  weights: typeof balanceV1.rankings.weights = balanceV1.rankings.weights,
): number {
  return (
    input.baseLevel * weights.baseLevel +
    input.storageLevel * weights.storageLevel +
    input.raidWins * weights.raidWin +
    input.caveClears * weights.caveClear +
    input.energyLooted * weights.energyLoot +
    input.metalLooted * weights.metalLoot
  );
}

export function compareStandings(left: RankedCandidate, right: RankedCandidate): number {
  const scoreDelta = standingScore(right) - standingScore(left);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  if (right.raidWins !== left.raidWins) {
    return right.raidWins - left.raidWins;
  }
  if (right.caveClears !== left.caveClears) {
    return right.caveClears - left.caveClears;
  }
  return left.callsign.localeCompare(right.callsign);
}

function asCount(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

function toEntry(row: RankedCandidate, rank: number, viewerAuthUserId: string | null): StandingEntry {
  return {
    rank,
    callsign: row.callsign,
    kind: row.kind,
    baseLevel: row.baseLevel,
    storageLevel: row.storageLevel,
    raidWins: row.raidWins,
    caveClears: row.caveClears,
    score: standingScore(row),
    you: viewerAuthUserId !== null && row.authUserId === viewerAuthUserId,
  };
}

export async function loadWorldStandings(
  db: AppDb,
  input: { viewerAuthUserId?: string | null; boardLimit?: number; includeIntel?: boolean } = {},
): Promise<WorldStandings> {
  const boardLimit = input.boardLimit ?? balanceV1.rankings.boardLimit;
  const [world] = await db.select({ id: worlds.id, slug: worlds.slug }).from(worlds).where(eq(worlds.status, "ACTIVE")).limit(1);

  const commanderRows = await db
    .select({
      playerId: players.id,
      authUserId: players.authUserId,
      callsign: players.displayName,
      kind: players.kind,
      baseLevel: bases.level,
      storageLevel: bases.storageLevel,
    })
    .from(players)
    .innerJoin(bases, eq(bases.playerId, players.id))
    .where(
      and(
        eq(players.status, "ACTIVE"),
        isNotNull(players.displayName),
        world ? eq(players.worldId, world.id) : sql`true`,
      ),
    );

  const raidRows = await db
    .select({
      playerId: battleReports.playerId,
      raidWins: sql<number>`coalesce(sum(case when ${battleReports.kind} = 'PVP' and ${battleReports.outcome} = 'ATTACKER_WIN' then 1 else 0 end), 0)::int`,
      energyLooted: sql<number>`coalesce(sum(case when ${battleReports.kind} = 'PVP' and ${battleReports.outcome} = 'ATTACKER_WIN' then ${battleReports.energyLooted} else 0 end), 0)::int`,
      metalLooted: sql<number>`coalesce(sum(case when ${battleReports.kind} = 'PVP' and ${battleReports.outcome} = 'ATTACKER_WIN' then ${battleReports.metalLooted} else 0 end), 0)::int`,
    })
    .from(battleReports)
    .groupBy(battleReports.playerId);

  const caveRows = await db
    .select({
      playerId: caveClears.playerId,
      caveClears: sql<number>`count(*)::int`,
    })
    .from(caveClears)
    .groupBy(caveClears.playerId);

  const raidsByPlayer = new Map(raidRows.map((row) => [row.playerId, row]));
  const cavesByPlayer = new Map(caveRows.map((row) => [row.playerId, asCount(row.caveClears)]));

  const ranked = commanderRows
    .filter((row): row is typeof row & { callsign: string } => Boolean(row.callsign))
    .map((row) => {
      const raids = raidsByPlayer.get(row.playerId);
      return {
        playerId: row.playerId,
        authUserId: row.authUserId,
        callsign: row.callsign,
        kind: row.kind as PlayerKind,
        baseLevel: row.baseLevel,
        storageLevel: row.storageLevel,
        raidWins: asCount(raids?.raidWins),
        caveClears: cavesByPlayer.get(row.playerId) ?? 0,
        energyLooted: asCount(raids?.energyLooted),
        metalLooted: asCount(raids?.metalLooted),
      } satisfies RankedCandidate;
    })
    .sort(compareStandings);

  const viewerAuthUserId = input.viewerAuthUserId ?? null;
  const board = ranked.slice(0, boardLimit).map((row, index) => toEntry(row, index + 1, viewerAuthUserId));
  const viewerIndex = ranked.findIndex((row) => row.authUserId === viewerAuthUserId);
  const you =
    viewerIndex >= 0 ? toEntry(ranked[viewerIndex]!, viewerIndex + 1, viewerAuthUserId) : null;
  if (you && !board.some((row) => row.you)) {
    board.push(you);
  }

  const attacker = alias(players, "standing_attacker");
  const defender = alias(players, "standing_defender");
  const intelRows =
    input.includeIntel === false
      ? []
      : await db
          .select({
            id: battleReports.id,
            outcome: battleReports.outcome,
            createdAt: battleReports.createdAt,
            attackerName: attacker.displayName,
            defenderName: defender.displayName,
          })
          .from(battleReports)
          .innerJoin(attacker, eq(attacker.id, battleReports.playerId))
          .leftJoin(defender, eq(defender.id, battleReports.defenderPlayerId))
          .where(eq(battleReports.kind, "PVP"))
          .orderBy(desc(battleReports.createdAt))
          .limit(balanceV1.rankings.intelLimit);

  const intel: RaidIntel[] = intelRows
    .filter((row) => Boolean(row.attackerName))
    .map((row) => ({
      id: row.id,
      attacker: row.attackerName as string,
      defender: row.defenderName,
      outcome: row.outcome as RaidIntel["outcome"],
      createdAt: row.createdAt.toISOString(),
    }));

  return {
    world: world?.slug ?? "unknown",
    commanderCount: ranked.length,
    you,
    board,
    intel,
  };
}
