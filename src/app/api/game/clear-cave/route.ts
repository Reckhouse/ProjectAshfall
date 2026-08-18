import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { clearCave } from "@/game/services/caves";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { clearCaveCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`clear-cave:${user.id}`, 40, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many cave commands.", 429);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = clearCaveCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid cave command.", 400);
    }

    const result = await clearCave(db, user.id, {
      actionId: parsed.data.actionId,
      caveId: parsed.data.payload.caveId,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "game.clear-cave" });
  }
}
