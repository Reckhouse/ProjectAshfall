import { z } from "zod";
import { GameError } from "@/game/domain/errors";

export const CLIENT_OWNED_STATE_KEYS = [
  "x",
  "y",
  "energy",
  "metal",
  "playerId",
  "worldId",
  "base",
  "location",
  "locationType",
  "remaining",
  "amount",
  "capacity",
  "tier",
  "bonusBps",
  "affinity",
  "wounded",
  "attackPower",
  "defensePower",
] as const;

export function rejectClientOwnedState(body: unknown): void {
  if (!body || typeof body !== "object") {
    return;
  }
  const record = body as Record<string, unknown>;
  if (CLIENT_OWNED_STATE_KEYS.some((key) => key in record)) {
    throw new GameError("INVALID_COMMAND", "Client cannot set authoritative game state.", 400);
  }
  if (record.payload && typeof record.payload === "object") {
    const payload = record.payload as Record<string, unknown>;
    if (CLIENT_OWNED_STATE_KEYS.some((key) => key in payload)) {
      throw new GameError("INVALID_COMMAND", "Client cannot set authoritative game state.", 400);
    }
  }
}

export const moveCommandSchema = z
  .object({
    actionId: z.uuid(),
    payload: z
      .object({
        direction: z.enum(["north", "south", "east", "west"]),
      })
      .strict(),
  })
  .strict();

export const locationCommandSchema = z
  .object({
    actionId: z.uuid(),
  })
  .strict();

export const departCommandSchema = z
  .object({
    actionId: z.uuid(),
    payload: z
      .object({
        offenseCount: z.number().int().min(0).max(999).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const recruitCommandSchema = z
  .object({
    actionId: z.uuid(),
    payload: z
      .object({
        unitType: z.enum(["OFFENSE", "DEFENSE"]),
        count: z.number().int().min(1).max(20),
      })
      .strict(),
  })
  .strict();

export const chunkQuerySchema = z.object({
  chunkX: z.number().int(),
  chunkY: z.number().int(),
  radius: z.number().int().min(0).max(2).optional(),
});

export const collectCommandSchema = z
  .object({
    actionId: z.uuid(),
    payload: z
      .object({
        nodeId: z.uuid(),
      })
      .strict(),
  })
  .strict();

export const clearCaveCommandSchema = z
  .object({
    actionId: z.uuid(),
    payload: z
      .object({
        caveId: z.uuid(),
      })
      .strict(),
  })
  .strict();
