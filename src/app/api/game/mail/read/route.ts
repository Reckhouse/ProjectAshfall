import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { markMailRead } from "@/game/services/mail";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { readMailCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    if (!consumeRateLimit(`mail:${user.id}`, 20, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many mail commands.", 429);
    }
    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = readMailCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid mail read command.", 400);
    }
    const mail = await markMailRead(db, user.id, {
      actionId: parsed.data.actionId,
      messageId: parsed.data.payload.messageId,
    });
    return jsonOk({ mail });
  } catch (error) {
    return jsonError(error, { commandType: "game.mail.read" });
  }
}
