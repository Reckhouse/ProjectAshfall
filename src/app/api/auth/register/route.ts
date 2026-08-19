import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { applySessionCookie, getAuthUserFromRequest, issueSession } from "@/lib/auth/session";
import { createUserAccount } from "@/lib/auth/service";
import { registerSchema } from "@/lib/validation/auth";
import { claimCallsign, isCallsignTaken } from "@/game/services/callsign";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { parseCallsign } from "@/lib/validation/callsign";

export const runtime = "nodejs";

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  try {
    if (!consumeRateLimit(`auth:register:${clientKey(request)}`, 30, 10 * 60 * 1000)) {
      throw new GameError("RATE_LIMITED", "Too many account attempts. Wait and try again.", 429);
    }

    const db = await getDb();
    const existing = await getAuthUserFromRequest(db, request);
    if (existing) {
      return jsonOk({ redirectTo: "/game" });
    }

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid registration details.",
        400,
      );
    }

    const callsign = parsed.data.callsign?.trim() ? parseCallsign(parsed.data.callsign) : null;
    if (callsign && (await isCallsignTaken(db, callsign))) {
      throw new GameError("CALLSIGN_TAKEN", "That callsign is already in use.", 409);
    }

    const user = await createUserAccount(db, parsed.data);
    const session = await issueSession(db, user.id);
    if (callsign) {
      await ensurePlayerProvisioned(db, user.id);
      await claimCallsign(db, user.id, callsign);
    }
    const response = jsonOk({ redirectTo: "/game" }, 201);
    applySessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return jsonError(error, { commandType: "auth.register" });
  }
}
