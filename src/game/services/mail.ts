import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { allianceMembers, alliances, gameActions, mailMessages, mailReceipts, players } from "@/db/schema";
import type { AppDb, AppTx } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type { MailDesk, MailItem } from "@/game/domain/types";
import { createId } from "@/lib/ids";
import { logEvent } from "@/lib/logging";
import { parseCallsign } from "@/lib/validation/callsign";
import { parseMailBody } from "@/lib/validation/mail";

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
  await tx
    .insert(gameActions)
    .values({
      id: createId(),
      playerId: input.playerId,
      actionKey: input.actionKey,
      actionType: input.actionType,
      status: "COMPLETED",
      resultCode: "OK",
      resultPayload: input.resultPayload ?? null,
      completedAt: new Date(),
    })
    .onConflictDoNothing({ target: [gameActions.playerId, gameActions.actionKey] });
}

async function requireHumanCommander(tx: AppTx, authUserId: string) {
  const [player] = await tx.select().from(players).where(eq(players.authUserId, authUserId)).for("update").limit(1);
  if (!player || player.status !== "ACTIVE") {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }
  if (player.kind === "BOT") {
    throw new GameError("INVALID_COMMAND", "Bots cannot use mail.", 400);
  }
  if (!player.displayName) {
    throw new GameError("INVALID_COMMAND", "Claim a callsign before sending mail.", 400);
  }
  if (!player.worldId) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Player record was not found.", 404);
  }
  return player;
}

export async function countUnreadMail(db: AppDb | AppTx, playerId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(mailReceipts)
    .where(and(eq(mailReceipts.playerId, playerId), isNull(mailReceipts.readAt)));
  return Number(row?.count ?? 0);
}

async function loadDeskForPlayer(tx: AppDb | AppTx, player: typeof players.$inferSelect): Promise<MailDesk> {
  const rows = await tx
    .select({
      id: mailMessages.id,
      kind: mailMessages.kind,
      body: mailMessages.body,
      createdAt: mailMessages.createdAt,
      fromCallsign: players.displayName,
      fromPlayerId: mailMessages.fromPlayerId,
      allianceTag: alliances.tag,
      readAt: mailReceipts.readAt,
    })
    .from(mailReceipts)
    .innerJoin(mailMessages, eq(mailMessages.id, mailReceipts.messageId))
    .innerJoin(players, eq(players.id, mailMessages.fromPlayerId))
    .leftJoin(alliances, eq(alliances.id, mailMessages.allianceId))
    .where(eq(mailReceipts.playerId, player.id))
    .orderBy(desc(mailMessages.createdAt))
    .limit(balanceV1.mail.inboxLimit);

  const inbox: MailItem[] = rows
    .filter((row): row is typeof row & { fromCallsign: string } => Boolean(row.fromCallsign))
    .map((row) => ({
      id: row.id,
      kind: row.kind === "ALLIANCE" ? "ALLIANCE" : "DIRECT",
      fromCallsign: row.fromCallsign,
      allianceTag: row.allianceTag ?? null,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null || row.fromPlayerId === player.id,
      you: row.fromPlayerId === player.id,
    }));

  const [membership] = await tx
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.playerId, player.id))
    .limit(1);

  return {
    unreadCount: await countUnreadMail(tx, player.id),
    canPostAlliance: Boolean(membership),
    inbox,
  };
}

export async function loadMailDesk(db: AppDb, authUserId: string): Promise<MailDesk> {
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player || player.status !== "ACTIVE") {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }
  return loadDeskForPlayer(db, player);
}

export async function sendMail(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; body: unknown; toCallsign?: unknown; channel?: unknown },
): Promise<MailDesk> {
  const body = parseMailBody(input.body);
  const channel = input.channel === "ALLIANCE" ? "ALLIANCE" : input.toCallsign != null ? "DIRECT" : null;
  if (!channel) {
    throw new GameError("INVALID_COMMAND", "Choose a recipient callsign or the alliance channel.", 400);
  }

  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as MailDesk;
    }

    const messageId = createId();
    if (channel === "DIRECT") {
      const callsign = parseCallsign(input.toCallsign);
      const [target] = await tx
        .select()
        .from(players)
        .where(sql`lower(${players.displayName}) = ${callsign.toLowerCase()}`)
        .limit(1);
      if (!target || !target.displayName) {
        throw new GameError("INVALID_COMMAND", "No commander with that callsign was found.", 400);
      }
      if (target.id === player.id) {
        throw new GameError("INVALID_COMMAND", "You cannot mail yourself.", 400);
      }
      if (target.kind === "BOT") {
        throw new GameError("INVALID_COMMAND", "Bots cannot receive mail.", 400);
      }
      await tx.insert(mailMessages).values({
        id: messageId,
        worldId: player.worldId!,
        kind: "DIRECT",
        fromPlayerId: player.id,
        toPlayerId: target.id,
        allianceId: null,
        body,
      });
      await tx.insert(mailReceipts).values([
        { messageId, playerId: target.id, readAt: null },
        { messageId, playerId: player.id, readAt: new Date() },
      ]);
    } else {
      const [membership] = await tx
        .select({ allianceId: allianceMembers.allianceId })
        .from(allianceMembers)
        .where(eq(allianceMembers.playerId, player.id))
        .limit(1);
      if (!membership) {
        throw new GameError("NOT_IN_ALLIANCE", "Join an alliance before posting a circular.", 400);
      }
      const members = await tx
        .select({ playerId: allianceMembers.playerId })
        .from(allianceMembers)
        .where(eq(allianceMembers.allianceId, membership.allianceId));
      await tx.insert(mailMessages).values({
        id: messageId,
        worldId: player.worldId!,
        kind: "ALLIANCE",
        fromPlayerId: player.id,
        toPlayerId: null,
        allianceId: membership.allianceId,
        body,
      });
      await tx.insert(mailReceipts).values(
        members.map((member) => ({
          messageId,
          playerId: member.playerId,
          readAt: member.playerId === player.id ? new Date() : null,
        })),
      );
    }

    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: channel === "DIRECT" ? "MAIL_SEND" : "MAIL_ALLIANCE",
      resultPayload: next,
    });
    logEvent({ event: "mail.sent", authUserId, playerId: player.id });
    return next;
  });
}

export async function markMailRead(
  db: AppDb,
  authUserId: string,
  input: { actionId: string; messageId: string },
): Promise<MailDesk> {
  return db.transaction(async (tx) => {
    const player = await requireHumanCommander(tx, authUserId);
    const replayed = await replayAction(tx, player.id, input.actionId);
    if (replayed !== "continue") {
      return replayed as MailDesk;
    }
    const updated = await tx
      .update(mailReceipts)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(mailReceipts.messageId, input.messageId),
          eq(mailReceipts.playerId, player.id),
          isNull(mailReceipts.readAt),
        ),
      )
      .returning({ messageId: mailReceipts.messageId });
    if (updated.length === 0) {
      const [existing] = await tx
        .select({ messageId: mailReceipts.messageId })
        .from(mailReceipts)
        .where(and(eq(mailReceipts.messageId, input.messageId), eq(mailReceipts.playerId, player.id)))
        .limit(1);
      if (!existing) {
        throw new GameError("INVALID_COMMAND", "That message is not in your inbox.", 400);
      }
    }
    const next = await loadDeskForPlayer(tx, player);
    await recordAction(tx, {
      playerId: player.id,
      actionKey: input.actionId,
      actionType: "MAIL_READ",
      resultPayload: next,
    });
    return next;
  });
}
