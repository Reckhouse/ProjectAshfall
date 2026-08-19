import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { loadMailDesk, sendMail } from "@/game/services/mail";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { rejectClientOwnedState, sendMailCommandSchema } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    return jsonOk({ mail: await loadMailDesk(db, user.id) });
  } catch (error) {
    return jsonError(error, { commandType: "game.mail" });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    if (!consumeRateLimit(`mail:${user.id}`, 12, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many mail commands.", 429);
    }
    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = sendMailCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid mail command.", 400);
    }
    const mail = await sendMail(db, user.id, {
      actionId: parsed.data.actionId,
      body: parsed.data.payload.body,
      toCallsign: parsed.data.payload.toCallsign,
      channel: parsed.data.payload.channel,
    });
    return jsonOk({ mail }, 201);
  } catch (error) {
    return jsonError(error, { commandType: "game.mail.send" });
  }
}
