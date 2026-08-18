import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { provisionCommandSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`provision:${user.id}`, 20, 10 * 60 * 1000)) {
      throw new GameError("RATE_LIMITED", "Too many provisioning attempts.", 429);
    }

    const body = await request.json().catch(() => ({}));
    if (body && typeof body === "object") {
      const spoofKeys = ["x", "y", "energy", "metal", "playerId", "worldId", "base"];
      if (spoofKeys.some((key) => key in body)) {
        throw new GameError("INVALID_COMMAND", "Client cannot set authoritative game state.", 400);
      }
    }

    const parsed = provisionCommandSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid provision command.", 400);
    }

    const player = await ensurePlayerProvisioned(db, user.id, { actionId: parsed.data.actionId });
    return jsonOk({ player });
  } catch (error) {
    return jsonError(error, { commandType: "game.provision" });
  }
}
