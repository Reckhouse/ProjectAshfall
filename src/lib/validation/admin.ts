import { z } from "zod";
import { callsignSchema } from "@/lib/validation/callsign";

export const claimCallsignSchema = z
  .object({
    callsign: callsignSchema,
  })
  .strict();

export const spawnBotSchema = z
  .object({
    callsign: z.string().trim().max(16).optional(),
    difficulty: z.enum(["SCOUT", "RAIDER", "WARLORD"]),
  })
  .strict();

export const tickBotsSchema = z
  .object({
    playerId: z.uuid().optional(),
  })
  .strict();

export const toggleBotSchema = z
  .object({
    playerId: z.uuid(),
    enabled: z.boolean(),
  })
  .strict();
