import { getDb } from "@/db/client";
import { GameError } from "@/game/domain/errors";
import { getVisibleChunks } from "@/game/services/chunks";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { chunkQuerySchema } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }

    const url = new URL(request.url);
    const parsed = chunkQuerySchema.safeParse({
      chunkX: Number(url.searchParams.get("cx")),
      chunkY: Number(url.searchParams.get("cy")),
      radius: url.searchParams.has("radius") ? Number(url.searchParams.get("radius")) : undefined,
    });
    if (!parsed.success) {
      throw new GameError("INVALID_COMMAND", "Invalid chunk query.", 400);
    }

    const view = await getVisibleChunks(db, user.id, parsed.data);
    return jsonOk(view);
  } catch (error) {
    return jsonError(error, { commandType: "game.chunks" });
  }
}
