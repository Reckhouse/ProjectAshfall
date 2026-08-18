import { and, eq, gte, lte } from "drizzle-orm";
import { bases, players, worlds } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";
import type { WorldView } from "@/game/domain/types";
import { chunkCoord, materializeChunk } from "@/game/world/chunks";

function toWorldView(world: typeof worlds.$inferSelect): WorldView {
  return {
    id: world.id,
    slug: world.slug,
    seed: world.seed,
    generationVersion: world.generationVersion,
    width: world.width,
    height: world.height,
  };
}

export async function getVisibleChunks(
  db: AppDb,
  authUserId: string,
  input: { chunkX: number; chunkY: number; radius?: number },
) {
  const [player] = await db.select().from(players).where(eq(players.authUserId, authUserId)).limit(1);
  if (!player || player.status !== "ACTIVE" || !player.worldId) {
    throw new GameError("PLAYER_NOT_ACTIVE", "Commander is not active in the world.", 403);
  }
  if (player.x === null || player.y === null) {
    throw new GameError("PLAYER_NOT_PROVISIONED", "Field location is not ready.", 409);
  }

  const radius = Math.min(input.radius ?? 1, balanceV1.movement.maxChunkRadius);
  if (!Number.isInteger(input.chunkX) || !Number.isInteger(input.chunkY)) {
    throw new GameError("INVALID_COMMAND", "Chunk coordinates must be integers.", 400);
  }

  const playerChunkX = chunkCoord(player.x);
  const playerChunkY = chunkCoord(player.y);
  if (
    Math.abs(input.chunkX - playerChunkX) > balanceV1.movement.maxChunkRadius ||
    Math.abs(input.chunkY - playerChunkY) > balanceV1.movement.maxChunkRadius
  ) {
    throw new GameError("INVALID_COMMAND", "Chunk is outside the visible range.", 400);
  }

  const [world] = await db.select().from(worlds).where(eq(worlds.id, player.worldId)).limit(1);
  if (!world) {
    throw new GameError("INTERNAL_GAME_ERROR", "Active world was not found.", 500);
  }

  const worldView = toWorldView(world);
  const size = balanceV1.world.chunkSize;
  const chunks = [];
  for (let cy = input.chunkY - radius; cy <= input.chunkY + radius; cy += 1) {
    for (let cx = input.chunkX - radius; cx <= input.chunkX + radius; cx += 1) {
      chunks.push(materializeChunk(worldView, cx, cy));
    }
  }

  const minX = (input.chunkX - radius) * size;
  const maxX = (input.chunkX + radius + 1) * size - 1;
  const minY = (input.chunkY - radius) * size;
  const maxY = (input.chunkY + radius + 1) * size - 1;

  const nearbyBases = await db
    .select({
      x: bases.x,
      y: bases.y,
      playerId: bases.playerId,
    })
    .from(bases)
    .where(
      and(
        eq(bases.worldId, world.id),
        gte(bases.x, minX),
        lte(bases.x, maxX),
        gte(bases.y, minY),
        lte(bases.y, maxY),
      ),
    );

  return {
    world: world.slug,
    chunkSize: size,
    player: {
      x: player.x,
      y: player.y,
      locationType: player.locationType,
      chunkX: player.x === null ? chunkCoord(0) : chunkCoord(player.x),
      chunkY: player.y === null ? chunkCoord(0) : chunkCoord(player.y),
    },
    chunks,
    bases: nearbyBases.map((base) => ({
      x: base.x,
      y: base.y,
      owned: base.playerId === player.id,
    })),
  };
}
