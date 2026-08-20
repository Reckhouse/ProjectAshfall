import { and, asc, eq, sql } from "drizzle-orm";
import { allianceInvites, allianceMembers, alliances, gameActions, players } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type {
  AllianceDesk,
  AllianceInviteView,
  AllianceMemberView,
  AllianceRole,
  AllianceSummary,
} from "@/game/domain/types";
import { isUniqueViolation } from "@/game/services/spawn";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";
import { parseCallsign } from "@/lib/validation/callsign";
import { parseAllianceName, parseAllianceTag } from "@/lib/validation/alliance";

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

async function recordAction(
  tx: AppTx,
  input: {
    playerId: string;
    actionKey: string;
    actionType: string;
    resultPayload: unknown;
  },
): Promise<void> {
  await tx.insert(gameActions).values({
    id: createId(),
    playerId: input.playerId,
    actionKey: input.actionKey,
    actionType: input.actionType,
    status: "COMPLETED",
    resultCode: "OK",
    resultPayload: input.resultPayload ?? null,
    completedAt: new Date(),
  }).onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
}

async function requireHumanCommander(tx: AppTx, authUserId: string) {
  const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
  if (!player || player.status !== "ACTIVE") {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }
  if (player.kind === "BOT") {
    throw new GameError("INVALID_COMMAND", "Bots cannot join alliances.", 400);
  }
  if (!player.displayName) {
    throw new GameError("INVALID_COMMAND", "Claim a callsign before using alliances.", 400);
  }
  if (!player.worldId) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Player record was not found.", 404);
  }
  return player;
}

export async function getAllianceSummary(
  db: AppDb | AppTx,
  playerId: string,
): Promise<AllianceSummary | null> {
  const [row] = await db
    .select({
      tag: alliances.tag,
      name: alliances.name,
      role: allianceMembers.role,
    })
    .from(allianceMembers)
    .innerJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    tag: row.tag,
    name: row.name,
    role: row.role === "LEADER" ? "LEADER" : "MEMBER",
  };
}

export async function getAllianceIdForPlayer(
  db: AppDb | AppTx,
  playerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, playerId))
    .limit(1);
  return row?.allianceId ?? null;
}

export async function sameAlliance(
  db: AppDb | AppTx,
  leftPlayerId: string,
  rightPlayerId: string,
): Promise<boolean> {
  const [left, right] = await Promise.all([
    getAllianceIdForPlayer(db, leftPlayerId),
    getAllianceIdForPlayer(db, rightPlayerId),
  ]);
  return Boolean(left && right && left === right);
}

async function loadDeskForPlayer(tx: AppDb | AppTx, player: typeof players.$inferSelect): Promise<AllianceDesk> {
  const membership = await tx
    .select({
      allianceId: allianceMembers.allianceId,
      role: allianceMembers.role,
      tag: alliances.tag,
      name: alliances.name,
    })
    .from(allianceMembers)
    .innerJoin(alliances, eq(alliances.id, allianceMembers.allianceId))
    .where(eq(allianceMembers.playerId, player.id))
    .limit(1);

  let alliance: AllianceDesk["alliance"] = null;
  if (membership[0]) {
    const roster = await tx
      .select({
        callsign: players.displayName,
        role: allianceMembers.role,
        playerId: allianceMembers.playerId,
      })
      .from(allianceMembers)
      .innerJoin(players, eq(players.id, allianceMembers.playerId))
      .where(eq(allianceMembers.allianceId, membership[0].allianceId))
      .orderBy(asc(allianceMembers.joinedAt));
    const members: AllianceMemberView[] = roster
      .filter((row): row is typeof row & { callsign: string } => Boolean(row.callsign))
      .map((row) => ({
        callsign: row.callsign,
        role: (row.role === "LEADER" ? "LEADER" : "MEMBER") as AllianceRole,
        you: row.playerId === player.id,
      }));
    alliance = {
      tag: membership[0].tag,
      name: membership[0].name,
      role: membership[0].role === "LEADER" ? "LEADER" : "MEMBER",
      members,
    };
  }

  const incomingRows = await tx
    .select({
      id: allianceInvites.id,
      tag: alliances.tag,
      name: alliances.name,
      fromCallsign: players.displayName,
    })
    .from(allianceInvites)
    .innerJoin(alliances, eq(alliances.id, allianceInvites.allianceId))
    .innerJoin(players, eq(players.id, allianceInvites.fromPlayerId))
    .where(and(eq(allianceInvites.toPlayerId, player.id), eq(allianceInvites.status, "PENDING")))
    .orderBy(asc(allianceInvites.createdAt));
  const incoming: AllianceInviteView[] = incomingRows
    .filter((row): row is typeof row & { fromCallsign: string } => Boolean(row.fromCallsign))
    .map((row) => ({
      id: row.id,
      tag: row.tag,
      name: row.name,
      fromCallsign: row.fromCallsign,
    }));

  const outgoingRows = alliance
    ? await tx
        .select({
          id: allianceInvites.id,
          callsign: players.displayName,
        })
        .from(allianceInvites)
        .innerJoin(players, eq(players.id, allianceInvites.toPlayerId))
        .where(
          and(
            eq(allianceInvites.allianceId, membership[0]!.allianceId),
            eq(allianceInvites.status, "PENDING"),
          ),
        )
        .orderBy(asc(allianceInvites.createdAt))
    : [];
  const outgoing = outgoingRows
    .filter((row): row is typeof row & { callsign: string } => Boolean(row.callsign))
    .map((row) => ({ id: row.id, callsign: row.callsign }));

  return { alliance, incoming, outgoing };
}

export async function loadAllianceDesk(db: AppDb, authUserId: string): Promise<AllianceDesk> {
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player || player.status !== "ACTIVE") {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }
  return loadDeskForPlayer(db, player);
}

export async function createAlliance(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; tag: unknown; name: unknown },
): Promise<AllianceDesk> {
  const tag = parseAllianceTag(input.tag);
  const name = parseAllianceName(input.name);
  const desk = await db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as AllianceDesk;
    }
    const existing = await getAllianceIdForPlayer(tx, player.id);
    if (existing) {
      throw new GameError("INVALID_COMMAND", "Leave your current alliance before founding another.", 400);
    }
    const allianceId = createId();
    try {
      await tx.insert(alliances).values({
        id: allianceId,
        worldId: player.worldId!,
        tag,
        name,
        leaderPlayerId: player.id,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new GameError("TAG_TAKEN", "That alliance tag is already in use.", 409);
      }
      throw error;
    }
    await tx.insert(allianceMembers).values({
      allianceId,
      playerId: player.id,
      role: "LEADER",
    });
    await tx
      .update(allianceInvites)
      .set({ status: "DECLINED" })
      .where(and(eq(allianceInvites.toPlayerId, player.id), eq(allianceInvites.status, "PENDING")));
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "ALLIANCE_CREATE",
      resultPayload: next,
    });
    logEvent({ event: "alliance.created", authUserId, playerId: player.id });
    return next;
  });
  return desk;
}

export async function inviteToAlliance(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; callsign: unknown },
): Promise<AllianceDesk> {
  const callsign = parseCallsign(input.callsign);
  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as AllianceDesk;
    }
    const [membership] = await tx
      .select()
      .from(allianceMembers)
      .where(eq(allianceMembers.playerId, player.id))
      .limit(1);
    if (!membership || membership.role !== "LEADER") {
      throw new GameError("NOT_ALLIANCE_LEADER", "Only the alliance leader can send invites.", 403);
    }
    const [target] = await tx
      .select()
      .from(players)
      .where(sql`lower(${players.displayName}) = ${callsign.toLowerCase()}`)
      .limit(1);
    if (!target || !target.displayName) {
      throw new GameError("INVALID_COMMAND", "No commander with that callsign was found.", 400);
    }
    if (target.id === player.id) {
      throw new GameError("INVALID_COMMAND", "You are already in this alliance.", 400);
    }
    if (target.kind === "BOT") {
      throw new GameError("INVALID_COMMAND", "Bots cannot join alliances.", 400);
    }
    const already = await getAllianceIdForPlayer(tx, target.id);
    if (already) {
      throw new GameError("INVALID_COMMAND", "That commander already belongs to an alliance.", 400);
    }
    const members = await tx
      .select({ playerId: allianceMembers.playerId })
      .from(allianceMembers)
      .where(eq(allianceMembers.allianceId, membership.allianceId));
    const pending = await tx
      .select({ id: allianceInvites.id })
      .from(allianceInvites)
      .where(and(eq(allianceInvites.allianceId, membership.allianceId), eq(allianceInvites.status, "PENDING")));
    if (members.length + pending.length >= balanceV1.alliances.maxMembers) {
      throw new GameError("ALLIANCE_FULL", "That alliance has no open slots.", 400);
    }
    try {
      await tx.insert(allianceInvites).values({
        id: createId(),
        allianceId: membership.allianceId,
        fromPlayerId: player.id,
        toPlayerId: target.id,
        status: "PENDING",
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new GameError("INVALID_COMMAND", "That commander already has a pending invite.", 400);
      }
      throw error;
    }
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "ALLIANCE_INVITE",
      resultPayload: next,
    });
    return next;
  });
}

export async function respondToAllianceInvite(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; inviteId: string; accept: boolean },
): Promise<AllianceDesk> {
  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as AllianceDesk;
    }
    const [invite] = await tx
      .select()
      .from(allianceInvites)
      .where(eq(allianceInvites.id, input.inviteId))
      .for("update")
      .limit(1);
    if (!invite || invite.toPlayerId !== player.id || invite.status !== "PENDING") {
      throw new GameError("INVALID_COMMAND", "That invite is no longer available.", 400);
    }
    if (!input.accept) {
      await tx
        .update(allianceInvites)
        .set({ status: "DECLINED" })
        .where(eq(allianceInvites.id, invite.id));
      const next = await loadDeskForPlayer(tx, player);
      await recordAction(tx, {
        playerId: player.id,
        actionKey: input.actionId,
        actionType: "ALLIANCE_RESPOND",
        resultPayload: next,
      });
      return next;
    }
    const already = await getAllianceIdForPlayer(tx, player.id);
    if (already) {
      throw new GameError("INVALID_COMMAND", "Leave your current alliance before accepting another invite.", 400);
    }
    await tx.select().from(alliances).where(eq(alliances.id, invite.allianceId)).for("update").limit(1);
    const members = await tx
      .select({ playerId: allianceMembers.playerId })
      .from(allianceMembers)
      .where(eq(allianceMembers.allianceId, invite.allianceId));
    if (members.length >= balanceV1.alliances.maxMembers) {
      throw new GameError("ALLIANCE_FULL", "That alliance has no open slots.", 400);
    }
    await tx.insert(allianceMembers).values({
      allianceId: invite.allianceId,
      playerId: player.id,
      role: "MEMBER",
    });
    await tx.update(allianceInvites).set({ status: "ACCEPTED" }).where(eq(allianceInvites.id, invite.id));
    await tx
      .update(allianceInvites)
      .set({ status: "DECLINED" })
      .where(and(eq(allianceInvites.toPlayerId, player.id), eq(allianceInvites.status, "PENDING")));
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "ALLIANCE_RESPOND",
      resultPayload: next,
    });
    return next;
  });
}

async function promoteOldestMember(tx: AppTx, allianceId: string): Promise<string | null> {
  const [nextLeader] = await tx
    .select()
    .from(allianceMembers)
    .where(eq(allianceMembers.allianceId, allianceId))
    .orderBy(asc(allianceMembers.joinedAt))
    .limit(1);
  if (!nextLeader) {
    await tx.delete(alliances).where(eq(alliances.id, allianceId));
    return null;
  }
  await tx
    .update(allianceMembers)
    .set({ role: "LEADER" })
    .where(and(eq(allianceMembers.allianceId, allianceId), eq(allianceMembers.playerId, nextLeader.playerId)));
  await tx
    .update(alliances)
    .set({ leaderPlayerId: nextLeader.playerId, updatedAt: new Date() })
    .where(eq(alliances.id, allianceId));
  return nextLeader.playerId;
}

export async function leaveAlliance(
  db: AppDb,
  authUserId: string,
  input: { actionId: string },
): Promise<AllianceDesk> {
  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as AllianceDesk;
    }
    const [membership] = await tx
      .select()
      .from(allianceMembers)
      .where(eq(allianceMembers.playerId, player.id))
      .limit(1);
    if (!membership) {
      throw new GameError("INVALID_COMMAND", "You are not in an alliance.", 400);
    }
    await tx
      .delete(allianceMembers)
      .where(and(eq(allianceMembers.allianceId, membership.allianceId), eq(allianceMembers.playerId, player.id)));
    if (membership.role === "LEADER") {
      await promoteOldestMember(tx, membership.allianceId);
    }
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "ALLIANCE_LEAVE",
      resultPayload: next,
    });
    return next;
  });
}

export async function kickAllianceMember(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; callsign: unknown },
): Promise<AllianceDesk> {
  const callsign = parseCallsign(input.callsign);
  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as AllianceDesk;
    }
    const [membership] = await tx
      .select()
      .from(allianceMembers)
      .where(eq(allianceMembers.playerId, player.id))
      .limit(1);
    if (!membership || membership.role !== "LEADER") {
      throw new GameError("NOT_ALLIANCE_LEADER", "Only the alliance leader can dismiss members.", 403);
    }
    const [target] = await tx
      .select()
      .from(players)
      .where(sql`lower(${players.displayName}) = ${callsign.toLowerCase()}`)
      .limit(1);
    if (!target) {
      throw new GameError("INVALID_COMMAND", "No commander with that callsign was found.", 400);
    }
    if (target.id === player.id) {
      throw new GameError("INVALID_COMMAND", "Leave the alliance instead of dismissing yourself.", 400);
    }
    const removed = await tx
      .delete(allianceMembers)
      .where(and(eq(allianceMembers.allianceId, membership.allianceId), eq(allianceMembers.playerId, target.id)))
      .returning({ playerId: allianceMembers.playerId });
    if (removed.length === 0) {
      throw new GameError("INVALID_COMMAND", "That commander is not in your alliance.", 400);
    }
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "ALLIANCE_KICK",
      resultPayload: next,
    });
    return next;
  });
}
