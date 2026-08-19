import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { loadWorldStandings } from "@/game/services/standings";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    if (!consumeRateLimit(`standings:${user.id}`, 40, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many standings requests.", 429);
    }

    const standings = await loadWorldStandings(db, { viewerAuthUserId: user.id });
    return jsonOk({ standings });
  } catch (error) {
    return jsonError(error, { commandType: "game.standings" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    throw new GameError("INVALID_COMMAND", "Standings are computed by the server.", 400);
  } catch (error) {
    return jsonError(error, { commandType: "game.standings" });
  }
}
