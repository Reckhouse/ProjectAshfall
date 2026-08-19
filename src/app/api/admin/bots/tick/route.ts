import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { tickEnabledBots } from "@/game/services/bots";
import { jsonError, jsonOk } from "@/lib/http";
import { assertAdmin } from "@/lib/auth/admin";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { tickBotsSchema } from "@/lib/validation/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const db = await getDb();
    assertAdmin(await getAuthUserFromRequest(db, request));
    const body = await request.json().catch(() => ({}));
    const parsed = tickBotsSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("VALIDATION_ERROR", "Invalid tick request.", 400);
    }
    const result = await tickEnabledBots(db, parsed.data);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error, { commandType: "admin.bots.tick" });
  }
}
