import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { respondToAllianceInvite } from "@/game/services/alliances";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { rejectClientOwnedState, respondAllianceCommandSchema } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    if (!consumeRateLimit(`alliance:${user.id}`, 20, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many alliance commands.", 429);
    }
    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = respondAllianceCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid alliance response.", 400);
    }
    const alliance = await respondToAllianceInvite(db, user.id, {
      actionId: parsed.data.actionId,
      inviteId: parsed.data.payload.inviteId,
      accept: parsed.data.payload.accept,
    });
    return jsonOk({ alliance });
  } catch (error) {
    return jsonError(error, { commandType: "game.alliance.respond" });
  }
}
