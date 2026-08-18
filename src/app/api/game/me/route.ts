import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    const player = await ensurePlayerProvisioned(db, user.id);
    return jsonOk({ player });
  } catch (error) {
    return jsonError(error, { commandType: "game.me" });
  }
}
