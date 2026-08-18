import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { upgradeBase } from "@/game/services/economy";
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

    if (!consumeRateLimit(`upgrade:${user.id}`, 20, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many upgrade commands.", 429);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = locationCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid upgrade command.", 400);
    }

    const result = await upgradeBase(db, user.id, parsed.data.actionId);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "game.upgrade-base" });
  }
}
