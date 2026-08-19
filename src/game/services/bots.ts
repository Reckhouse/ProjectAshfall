import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { bases, botProfiles, playerResources, players, raidCooldowns, worlds } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError, isGameError } from "@/game/domain/errors";
import type { BotDifficulty, Direction, PlayerKind, WorldView } from "@/game/domain/types";
import { isCallsignTaken } from "@/game/services/callsign";
import { clearCave, listCavesInBounds, materializeChunkCaves } from "@/game/services/caves";
import { collectResource, upgradeBase, upgradeStorage } from "@/game/services/economy";
import { listNodesInBounds, materializeChunkNodes } from "@/game/services/nodes";
import { departBase, movePlayer } from "@/game/services/move";
import { ensurePlayerProvisioned, loadSnapshot } from "@/game/services/provision";
import { isNewPlayerProtected, raidBase } from "@/game/services/raid";
import { recruitTroops } from "@/game/services/troops";
import { isUniqueViolation } from "@/game/services/spawn";
import { caveEnergyCost } from "@/game/world/caves";
import { chunkCoord } from "@/game/world/chunks";
import { DIRECTIONS, offsetCoordinate } from "@/game/world/directions";
import { baseUpgradeMetalCost, chebyshevDistance, storageUpgradeMetalCost } from "@/game/world/nodes";
import { createCryptoRng, createSeededRng } from "@/game/world/rng";
import { isInWorldBounds, isPassable } from "@/game/world/terrain";
import { parseCallsign } from "@/lib/validation/callsign";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";

export const BOT_DIFFICULTIES = ["SCOUT", "RAIDER", "WARLORD"] as const satisfies BotDifficulty[];

export type BotView = {
  playerId: string;
  displayName: string | null;
  difficulty: BotDifficulty;
  enabled: boolean;
  location: { type: string; x: number | null; y: number | null };
  base: { x: number; y: number; level: number; storageLevel: number } | null;
  resources: { energy: number; metal: number };
  lastAction: string | null;
  lastError: string | null;
  lastTickAt: string | null;
  tickCount: number;
};

function asDifficulty(value: string): BotDifficulty {
  if (value === "SCOUT" || value === "RAIDER" || value === "WARLORD") {
    return value;
  }
  throw new GameError("VALIDATION_ERROR", "Choose Scout, Raider, or Warlord difficulty.", 400);
}

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

function nextBotAuthUserId(): string {
  return `bot:${createId()}`;
}

function generatedCallsign(difficulty: BotDifficulty, serial: number): string {
  const prefix = difficulty === "SCOUT" ? "Scout" : difficulty === "RAIDER" ? "Raider" : "Warlord";
  return `${prefix}_${serial}`;
}

function directionToward(
  world: WorldView,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Direction | null {
  if (from.x === to.x && from.y === to.y) {
    return null;
  }
  const preferred: Direction[] = [];
  if (to.y < from.y) preferred.push("north");
  if (to.y > from.y) preferred.push("south");
  if (to.x < from.x) preferred.push("west");
  if (to.x > from.x) preferred.push("east");
  const ordered = [...preferred, ...DIRECTIONS.filter((direction) => !preferred.includes(direction))];
  for (const direction of ordered) {
    const next = offsetCoordinate(from, direction);
    if (isInWorldBounds(world, next.x, next.y) && isPassable(world, next.x, next.y)) {
      return direction;
    }
  }
  return null;
}

async function countBots(db: AppDb): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(botProfiles);
  return row?.count ?? 0;
}

export async function listBots(db: AppDb): Promise<BotView[]> {
  const rows = await db
    .select({
      playerId: botProfiles.playerId,
      displayName: players.displayName,
      difficulty: botProfiles.difficulty,
      enabled: botProfiles.enabled,
      locationType: players.locationType,
      x: players.x,
      y: players.y,
      baseX: bases.x,
      baseY: bases.y,
      baseLevel: bases.level,
      storageLevel: bases.storageLevel,
      energy: playerResources.energy,
      metal: playerResources.metal,
      lastAction: botProfiles.lastAction,
      lastError: botProfiles.lastError,
      lastTickAt: botProfiles.lastTickAt,
      tickCount: botProfiles.tickCount,
    })
    .from(botProfiles)
    .innerJoin(players, eq(players.id, botProfiles.playerId))
    .leftJoin(bases, eq(bases.playerId, players.id))
    .leftJoin(playerResources, eq(playerResources.playerId, players.id))
    .orderBy(asc(botProfiles.createdAt));

  return rows.map((row) => ({
    playerId: row.playerId,
    displayName: row.displayName,
    difficulty: asDifficulty(row.difficulty),
    enabled: row.enabled,
    location: { type: row.locationType, x: row.x, y: row.y },
    base:
      row.baseX !== null && row.baseY !== null
        ? { x: row.baseX, y: row.baseY, level: row.baseLevel ?? 1, storageLevel: row.storageLevel ?? 1 }
        : null,
    resources: { energy: row.energy ?? 0, metal: row.metal ?? 0 },
    lastAction: row.lastAction,
    lastError: row.lastError,
    lastTickAt: row.lastTickAt ? row.lastTickAt.toISOString() : null,
    tickCount: row.tickCount,
  }));
}

async function nextGeneratedCallsign(db: AppDb, difficulty: BotDifficulty): Promise<string> {
  for (let serial = (await countBots(db)) + 1; serial < 10_000; serial += 1) {
    const candidate = generatedCallsign(difficulty, serial);
    if (!(await isCallsignTaken(db, candidate))) {
      return candidate;
    }
  }
  throw new GameError("INTERNAL_GAME_ERROR", "Unable to allocate a bot callsign.", 500);
}

export async function spawnBot(
  db: AppDb,
  input: { callsign?: string; difficulty: string },
): Promise<BotView> {
  const difficulty = asDifficulty(input.difficulty);
  const active = await countBots(db);
  if (active >= balanceV1.bots.maxActive) {
    throw new GameError("INVALID_COMMAND", "Bot roster is at capacity.", 400);
  }

  const callsign = input.callsign?.trim()
    ? parseCallsign(input.callsign)
    : await nextGeneratedCallsign(db, difficulty);
  if (await isCallsignTaken(db, callsign)) {
    throw new GameError("CALLSIGN_TAKEN", "That callsign is already in use.", 409);
  }

  const authUserId = nextBotAuthUserId();
  const snapshot = await ensurePlayerProvisioned(db, authUserId, {
    rng: createCryptoRng(),
  });
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player || !snapshot.base) {
    throw new GameError("INTERNAL_GAME_ERROR", "Bot provision failed.", 500);
  }

  try {
    await db
      .update(players)
      .set({
        kind: "BOT",
        displayName: callsign,
        updatedAt: new Date(),
        version: player.version + 1,
      })
      .where(eq(players.id, player.id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new GameError("CALLSIGN_TAKEN", "That callsign is already in use.", 409);
    }
    throw error;
  }
  await db.insert(botProfiles).values({
    playerId: player.id,
    difficulty,
    enabled: true,
  });

  logEvent({ event: "admin.bot.spawned", playerId: player.id, commandType: difficulty });
  try {
    return await tickOneBot(db, player.id);
  } catch (error) {
    const message = isGameError(error) ? error.code : "INTERNAL_GAME_ERROR";
    logEvent({ event: "admin.bot.spawn.tick.failed", playerId: player.id, code: message });
    const [created] = (await listBots(db)).filter((bot) => bot.playerId === player.id);
    if (!created) {
      throw new GameError("INTERNAL_GAME_ERROR", "Bot record was not found after spawn.", 500);
    }
    return created;
  }
}

export async function setBotEnabled(db: AppDb, playerId: string, enabled: boolean): Promise<BotView> {
  const updated = await db
    .update(botProfiles)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(botProfiles.playerId, playerId))
    .returning({ playerId: botProfiles.playerId });
  if (updated.length === 0) {
    throw new GameError("INVALID_COMMAND", "Bot was not found.", 400);
  }
  const [bot] = (await listBots(db)).filter((entry) => entry.playerId === playerId);
  if (!bot) {
    throw new GameError("INVALID_COMMAND", "Bot was not found.", 400);
  }
  return bot;
}

type ScoutedArea = {
  nodes: Array<{ id: string; x: number; y: number; resourceType: "ENERGY" | "METAL"; remaining: number }>;
  caves: Array<{ id: string; x: number; y: number; tier: number; cleared: boolean }>;
  bases: Array<{
    id: string;
    x: number;
    y: number;
    playerId: string;
    kind: PlayerKind;
    createdAt: Date;
    onCooldown: boolean;
    protected: boolean;
  }>;
};

async function scoutAround(
  db: AppDb,
  world: WorldView,
  playerId: string,
  origin: { x: number; y: number },
  radius: number,
): Promise<ScoutedArea> {
  const minCX = chunkCoord(origin.x - radius);
  const maxCX = chunkCoord(origin.x + radius);
  const minCY = chunkCoord(origin.y - radius);
  const maxCY = chunkCoord(origin.y + radius);
  for (let cy = minCY; cy <= maxCY; cy += 1) {
    for (let cx = minCX; cx <= maxCX; cx += 1) {
      await materializeChunkNodes(db, world, cx, cy);
      await materializeChunkCaves(db, world, cx, cy);
    }
  }

  const bounds = {
    minX: origin.x - radius,
    maxX: origin.x + radius,
    minY: origin.y - radius,
    maxY: origin.y + radius,
  };
  const nodes = (await listNodesInBounds(db, world.id, bounds)).filter((node) => node.remaining > 0);
  const caves = await listCavesInBounds(db, { worldId: world.id, playerId, ...bounds });
  const nearbyBases = await db
    .select({
      id: bases.id,
      x: bases.x,
      y: bases.y,
      playerId: bases.playerId,
      kind: players.kind,
      createdAt: players.createdAt,
    })
    .from(bases)
    .innerJoin(players, eq(players.id, bases.playerId))
    .where(
      and(
        eq(bases.worldId, world.id),
        gte(bases.x, bounds.minX),
        lte(bases.x, bounds.maxX),
        gte(bases.y, bounds.minY),
        lte(bases.y, bounds.maxY),
      ),
    );
  const cooldowns = await db
    .select()
    .from(raidCooldowns)
    .where(eq(raidCooldowns.attackerPlayerId, playerId));
  const cooldownByDefender = new Map(cooldowns.map((row) => [row.defenderPlayerId, row.lastRaidAt]));
  const now = new Date();

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      x: node.x,
      y: node.y,
      resourceType: node.resourceType as "ENERGY" | "METAL",
      remaining: node.remaining,
    })),
    caves,
    bases: nearbyBases
      .filter((base) => base.playerId !== playerId)
      .map((base) => {
        const lastRaidAt = cooldownByDefender.get(base.playerId);
        const onCooldown = Boolean(
          lastRaidAt && now.getTime() - lastRaidAt.getTime() < balanceV1.pvp.repeatTargetCooldownMs,
        );
        return {
          id: base.id,
          x: base.x,
          y: base.y,
          playerId: base.playerId,
          kind: (base.kind === "BOT" ? "BOT" : "HUMAN") as PlayerKind,
          createdAt: base.createdAt,
          onCooldown,
          protected: isNewPlayerProtected(base.createdAt, now, base.kind === "BOT" ? "BOT" : "HUMAN"),
        };
      }),
  };
}

async function runSafe(label: string, run: () => Promise<unknown>): Promise<{ action: string; ok: boolean; code?: string }> {
  try {
    await run();
    return { action: label, ok: true };
  } catch (error) {
    if (isGameError(error)) {
      return { action: label, ok: false, code: error.code };
    }
    throw error;
  }
}

async function actAsBot(
  db: AppDb,
  bot: typeof players.$inferSelect,
  difficulty: BotDifficulty,
  actionIndex: number,
): Promise<{ action: string; ok: boolean; code?: string }> {
  const cfg = balanceV1.bots.difficulties[difficulty];
  const rng = createSeededRng(`${bot.id}:${bot.version}:${actionIndex}:${difficulty}`);
  const snapshot = await loadSnapshot(db, bot.id);
  const [worldRow] = bot.worldId ? await db.select().from(worlds).where(eq(worlds.id, bot.worldId)).limit(1) : [];
  if (!snapshot.location || !snapshot.base || !snapshot.resources || !worldRow) {
    return { action: "idle", ok: false, code: "PLAYER_NOT_PROVISIONED" };
  }
  const world = toWorldView(worldRow);
  const loc = snapshot.location;
  const authUserId = bot.authUserId;
  const actionId = createId();
  const area = await scoutAround(db, world, bot.id, loc, cfg.exploreRadius);
  const collectRange = balanceV1.economy.nodes.collectChebyshevRange;
  const raidRange = balanceV1.pvp.raidChebyshevRange;
  const reachableNode = area.nodes
    .filter((node) => chebyshevDistance(loc, node) <= collectRange)
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right) || left.id.localeCompare(right.id))[0];
  const reachableCave = area.caves
    .filter((cave) => !cave.cleared && chebyshevDistance(loc, cave) <= collectRange)
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right) || left.id.localeCompare(right.id))[0];
  const reachableBase = area.bases
    .filter((base) => !base.protected && !base.onCooldown && chebyshevDistance(loc, base) <= raidRange)
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right) || left.id.localeCompare(right.id))[0];
  const defense = snapshot.troops.defense.atBase;
  const offenseHome = snapshot.troops.offense.atBase;
  const offenseField = snapshot.troops.offense.deployed;
  const energy = snapshot.resources.energy;
  const metal = snapshot.resources.metal;
  const distHome = chebyshevDistance(loc, snapshot.base);

  if (loc.type === "BASE") {
    if (defense < cfg.targetDefense && metal >= balanceV1.troops.recruitMetalCost.DEFENSE) {
      return runSafe("recruit-defense", () =>
        recruitTroops(db, authUserId, { actionId, unitType: "DEFENSE", count: 1 }),
      );
    }
    if (offenseHome < cfg.targetOffense && metal >= balanceV1.troops.recruitMetalCost.OFFENSE) {
      return runSafe("recruit-offense", () =>
        recruitTroops(db, authUserId, { actionId, unitType: "OFFENSE", count: 1 }),
      );
    }
    const storageCost = storageUpgradeMetalCost(snapshot.base.storageLevel);
    if (
      storageCost !== null &&
      metal >= storageCost &&
      rng.nextInt(0, 10_000) < cfg.upgradeChanceBps
    ) {
      return runSafe("upgrade-storage", () => upgradeStorage(db, authUserId, actionId));
    }
    const baseCost = baseUpgradeMetalCost(snapshot.base.level);
    if (baseCost !== null && metal >= baseCost && rng.nextInt(0, 10_000) < cfg.upgradeChanceBps) {
      return runSafe("upgrade-base", () => upgradeBase(db, authUserId, actionId));
    }
    return runSafe("depart", () => departBase(db, authUserId, actionId, Math.min(offenseHome, cfg.targetOffense)));
  }

  if (reachableNode) {
    return runSafe(`collect-${reachableNode.resourceType.toLowerCase()}`, () =>
      collectResource(db, authUserId, { actionId, nodeId: reachableNode.id }),
    );
  }
  if (
    reachableBase &&
    offenseField > 0 &&
    energy >= balanceV1.pvp.raidEnergyCost &&
    rng.nextInt(0, 10_000) < cfg.raidChanceBps
  ) {
    return runSafe("raid", () => raidBase(db, authUserId, { actionId, targetBaseId: reachableBase.id }));
  }
  if (
    reachableCave &&
    offenseField > 0 &&
    energy >= caveEnergyCost(reachableCave.tier) &&
    rng.nextInt(0, 10_000) < cfg.caveChanceBps
  ) {
    return runSafe("clear-cave", () => clearCave(db, authUserId, { actionId, caveId: reachableCave.id }));
  }

  const needEnergy = energy < 80;
  const needMetal = metal < 80;
  const raidTarget = area.bases.find((base) => !base.protected && !base.onCooldown);
  const energyNode = area.nodes
    .filter((node) => node.resourceType === "ENERGY")
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right))[0];
  const metalNode = area.nodes
    .filter((node) => node.resourceType === "METAL")
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right))[0];
  const anyNode = area.nodes.sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right))[0];
  const openCave = area.caves
    .filter((cave) => !cave.cleared)
    .sort((left, right) => chebyshevDistance(loc, left) - chebyshevDistance(loc, right))[0];

  let goal: { x: number; y: number } | null = null;
  if (distHome > cfg.maxDistanceFromBase || (energy < 40 && !energyNode)) {
    goal = snapshot.base;
  } else if (needEnergy && energyNode) {
    goal = energyNode;
  } else if (needMetal && metalNode) {
    goal = metalNode;
  } else if (raidTarget && rng.nextInt(0, 10_000) < cfg.raidChanceBps) {
    goal = raidTarget;
  } else if (anyNode) {
    goal = anyNode;
  } else if (openCave) {
    goal = openCave;
  } else {
    goal = snapshot.base;
  }

  const direction =
    goal && (goal.x !== loc.x || goal.y !== loc.y)
      ? directionToward(world, loc, goal)
      : DIRECTIONS[rng.nextInt(0, DIRECTIONS.length)] ?? "north";
  if (!direction) {
    return { action: "blocked", ok: false, code: "BLOCKED_TILE" };
  }
  return runSafe(`move-${direction}`, () => movePlayer(db, authUserId, { actionId, direction }));
}

async function tickOneBot(db: AppDb, playerId: string): Promise<BotView> {
  const [profile] = await db.select().from(botProfiles).where(eq(botProfiles.playerId, playerId)).limit(1);
  const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!profile || !player || !profile.enabled) {
    throw new GameError("INVALID_COMMAND", "Bot was not found or is disabled.", 400);
  }
  const difficulty = asDifficulty(profile.difficulty);
  const cfg = balanceV1.bots.difficulties[difficulty];
  const now = new Date();
  if (profile.lastTickAt && now.getTime() - profile.lastTickAt.getTime() < balanceV1.bots.minTickIntervalMs) {
    const [current] = (await listBots(db)).filter((bot) => bot.playerId === playerId);
    return current!;
  }

  let lastAction = profile.lastAction;
  let lastError = null as string | null;
  for (let index = 0; index < cfg.actionsPerTick; index += 1) {
    const [fresh] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!fresh) {
      break;
    }
    const result = await actAsBot(db, fresh, difficulty, index);
    lastAction = result.ok ? result.action : `${result.action}:${result.code ?? "failed"}`;
    lastError = result.ok ? null : result.code ?? "failed";
  }

  await db
    .update(botProfiles)
    .set({
      lastTickAt: now,
      lastAction,
      lastError,
      tickCount: profile.tickCount + 1,
      updatedAt: now,
    })
    .where(eq(botProfiles.playerId, playerId));

  const [updated] = (await listBots(db)).filter((bot) => bot.playerId === playerId);
  return updated!;
}

export async function tickEnabledBots(
  db: AppDb,
  options?: { limit?: number; playerId?: string },
): Promise<{ ticked: BotView[]; skipped: number }> {
  if (options?.playerId) {
    return { ticked: [await tickOneBot(db, options.playerId)], skipped: 0 };
  }

  const limit = Math.min(options?.limit ?? balanceV1.bots.maxBotsPerTick, balanceV1.bots.maxBotsPerTick);
  const due = await db
    .select({ playerId: botProfiles.playerId })
    .from(botProfiles)
    .where(eq(botProfiles.enabled, true))
    .orderBy(sql`${botProfiles.lastTickAt} asc nulls first`, asc(botProfiles.createdAt))
    .limit(limit);

  const ticked: BotView[] = [];
  let skipped = 0;
  for (const row of due) {
    try {
      ticked.push(await tickOneBot(db, row.playerId));
    } catch (error) {
      skipped += 1;
      const message = isGameError(error) ? error.code : "INTERNAL_GAME_ERROR";
      await db
        .update(botProfiles)
        .set({ lastError: message, updatedAt: new Date() })
        .where(eq(botProfiles.playerId, row.playerId));
      logEvent({ event: "admin.bot.tick.failed", playerId: row.playerId, code: message });
    }
  }
  return { ticked, skipped };
}

export async function maybeTickBotsInBackground(db: AppDb): Promise<void> {
  const [enabled] = await db
    .select({ playerId: botProfiles.playerId })
    .from(botProfiles)
    .where(eq(botProfiles.enabled, true))
    .limit(1);
  if (!enabled) {
    return;
  }
  await tickEnabledBots(db, { limit: balanceV1.bots.maxBotsPerTick });
}
