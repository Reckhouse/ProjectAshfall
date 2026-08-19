import { getDb } from "@/db/client";
import { loadAdminStats } from "@/game/services/admin-stats";
import { maybeTickBotsInBackground } from "@/game/services/bots";
import { jsonError, jsonOk } from "@/lib/http";
import { assertAdmin } from "@/lib/auth/admin";
import { getAuthUserFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const db = await getDb();
    assertAdmin(await getAuthUserFromRequest(db, request));
    await maybeTickBotsInBackground(db).catch(() => undefined);
    const stats = await loadAdminStats(db);
    return jsonOk({ stats });
  } catch (error) {
    return jsonError(error, { commandType: "admin.stats" });
  }
}
