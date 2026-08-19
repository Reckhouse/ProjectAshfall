import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { tickEnabledBots } from "@/game/services/bots";
import { jsonError, jsonOk } from "@/lib/http";
import { cronSecretAuthorized } from "@/lib/auth/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    if (!cronSecretAuthorized(request)) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    const db = await getDb();
    const result = await tickEnabledBots(db);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "cron.bots" });
  }
}
