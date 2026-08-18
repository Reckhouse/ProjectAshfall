import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { enterBase } from "@/game/services/move";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { locationCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";
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
    const parsed = locationCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid enter-base command.", 400);
    }

    const player = await enterBase(db, user.id, parsed.data.actionId);
    return jsonOk({ player });
  } catch (error) {
    return jsonError(error, { commandType: "game.enter-base" });
  }
}
