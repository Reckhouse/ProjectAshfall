import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { applySessionCookie, getAuthUserFromRequest, issueSession } from "@/lib/auth/session";
import { authenticateUser } from "@/lib/auth/service";
import { loginSchema } from "@/lib/validation/auth";

export const runtime = "nodejs";

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  try {
    if (!consumeRateLimit(`auth:login:${clientKey(request)}`, 10, 10 * 60 * 1000)) {
      throw new GameError("RATE_LIMITED", "Too many login attempts. Wait and try again.", 429);
    }

    const db = await getDb();
    const existing = await getAuthUserFromRequest(db, request);
    if (existing) {
      return jsonOk({ redirectTo: "/game" });
    }

    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid login details.", 400);
    }

    const user = await authenticateUser(db, parsed.data);
    const session = await issueSession(db, user.id);
    const response = jsonOk({ redirectTo: "/game" });
    applySessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return jsonError(error, { commandType: "auth.login" });
  }
}
