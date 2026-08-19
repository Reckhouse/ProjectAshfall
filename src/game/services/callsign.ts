import { eq, sql } from "drizzle-orm";
import { players } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { GameError } from "@/game/domain/errors";
import { parseCallsign } from "@/lib/validation/callsign";
import { isUniqueViolation } from "@/game/services/spawn";

export async function isCallsignTaken(db: AppDb, callsign: string, exceptPlayerId?: string): Promise<boolean> {
  const normalized = parseCallsign(callsign);
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(sql`lower(${players.displayName}) = ${normalized.toLowerCase()}`)
    .limit(2);
  return rows.some((row) => row.id !== exceptPlayerId);
}

export async function claimCallsign(
  db: AppDb,
  authUserId: string,
  rawCallsign: unknown,
): Promise<{ displayName: string }> {
  const displayName = parseCallsign(rawCallsign);
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Player record was not found.", 404);
  }
  if (player.kind === "BOT") {
    throw new GameError("INVALID_COMMAND", "Bot callsigns are set from the admin panel.", 400);
  }
  if (player.displayName) {
    throw new GameError("INVALID_COMMAND", "Callsign is already set.", 400);
  }
  if (await isCallsignTaken(db, displayName, player.id)) {
    throw new GameError("CALLSIGN_TAKEN", "That callsign is already in use.", 409);
  }

  try {
    const updated = await db
      .update(players)
      .set({
        displayName,
        updatedAt: new Date(),
        version: player.version + 1,
      })
      .where(eq(players.id, player.id))
      .returning({ displayName: players.displayName });
    if (!updated[0]?.displayName) {
      throw new GameError("CONFLICT_RETRY", "Callsign update raced. Retry.", 409);
    }
    return { displayName: updated[0].displayName };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new GameError("CALLSIGN_TAKEN", "That callsign is already in use.", 409);
    }
    throw error;
  }
}
