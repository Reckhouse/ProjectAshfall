import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { listBots, setBotEnabled, spawnBot } from "@/game/services/bots";
import { jsonError, jsonOk } from "@/lib/http";
import { assertAdmin } from "@/lib/auth/admin";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { spawnBotSchema, toggleBotSchema } from "@/lib/validation/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    assertAdmin(await getAuthUserFromRequest(db, request));
    return jsonOk({ bots: await listBots(db) });
  } catch (error) {
    return jsonError(error, { commandType: "admin.bots" });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    assertAdmin(await getAuthUserFromRequest(db, request));
    const body = await request.json().catch(() => ({}));
    const parsed = spawnBotSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid bot configuration.", 400);
    }
    const bot = await spawnBot(db, parsed.data);
    return jsonOk({ bot }, 201);
  } catch (error) {
    return jsonError(error, { commandType: "admin.bots.spawn" });
  }
}

export async function PATCH(request: Request) {
  try {
    const db = await getDb();
    assertAdmin(await getAuthUserFromRequest(db, request));
    const body = await request.json().catch(() => ({}));
    const parsed = toggleBotSchema.safeParse(body);
    if (!parsed.success) {
      throw new GameError("VALIDATION_ERROR", "Invalid bot update.", 400);
    }
    const bot = await setBotEnabled(db, parsed.data.playerId, parsed.data.enabled);
    return jsonOk({ bot });
  } catch (error) {
    return jsonError(error, { commandType: "admin.bots.toggle" });
  }
}
