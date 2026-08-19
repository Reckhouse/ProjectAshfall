import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { leaveAlliance } from "@/game/services/alliances";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { locationCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";

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
    const parsed = locationCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid alliance leave command.", 400);
    }
    const alliance = await leaveAlliance(db, user.id, { actionId: parsed.data.actionId });
    return jsonOk({ alliance });
  } catch (error) {
    return jsonError(error, { commandType: "game.alliance.leave" });
  }
}
