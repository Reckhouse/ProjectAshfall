import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { claimCallsign } from "@/game/services/callsign";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { claimCallsignSchema } from "@/lib/validation/admin";
import { rejectClientOwnedState } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    const body = await request.json().catch(() => ({}));
    rejectClientOwnedState(body);
    const parsed = claimCallsignSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid callsign.", 400);
    }

    await ensurePlayerProvisioned(db, user.id);
    const claimed = await claimCallsign(db, user.id, parsed.data.callsign);
    const player = await ensurePlayerProvisioned(db, user.id);
    return jsonOk({ player, callsign: claimed.displayName });
  } catch (error) {
    return jsonError(error, { commandType: "game.callsign" });
  }
}
