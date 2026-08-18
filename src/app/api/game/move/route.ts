import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { movePlayer } from "@/game/services/move";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { moveCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";
import { balanceV1 } from "@/game/config/balance.v1";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`move:${user.id}`, balanceV1.movement.maxCommandsPerMinute, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many movement commands.", 429);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = moveCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid move command.", 400);
    }

    const player = await movePlayer(db, user.id, {
      actionId: parsed.data.actionId,
      direction: parsed.data.payload.direction,
    });
    return jsonOk({ player });
  } catch (error) {
    return jsonError(error, { commandType: "game.move" });
  }
}
