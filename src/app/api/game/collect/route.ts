import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { collectResource } from "@/game/services/economy";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { collectCommandSchema, rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`collect:${user.id}`, 60, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many collection commands.", 429);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = collectCommandSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid collect command.", 400);
    }

    const result = await collectResource(db, user.id, {
      actionId: parsed.data.actionId,
      nodeId: parsed.data.payload.nodeId,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "game.collect" });
  }
}
