import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { recruitTroops } from "@/game/services/troops";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { recruitCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`recruit:${user.id}`, 40, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many recruit commands.", 429);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = recruitCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid recruit command.", 400);
    }

    const result = await recruitTroops(db, user.id, {
      actionId: parsed.data.actionId,
      unitType: parsed.data.payload.unitType,
      count: parsed.data.payload.count,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "game.recruit" });
  }
}
