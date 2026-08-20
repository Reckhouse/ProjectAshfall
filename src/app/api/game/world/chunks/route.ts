import { getDb } from "@/db/client";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import { getVisibleChunks } from "@/game/services/chunks";
import { jsonError, jsonOk } from "@/lib/http";
import { getAuthUserFromRequest } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { chunkQuerySchema } from "@/lib/validation/game";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const user = await getAuthUserFromRequest(db, request);
    if (!user) {
      throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
    }
    if (!consumeRateLimit(`chunks:${user.id}`, balanceV1.movement.maxCommandsPerMinute, 60_000)) {
      throw new GameError("RATE_LIMITED", "Too many chunk requests. Slow down.", 429);
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
