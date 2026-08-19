import { z } from "zod";
import { GameError } from "@/game/domain/errors";

export const CALLSIGN_MIN = 3;
export const CALLSIGN_MAX = 16;
export const CALLSIGN_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,15}$/;

export const RESERVED_CALLSIGNS = new Set([
  "admin",
  "administrator",
  "ashfall",
  "bot",
  "gm",
  "mod",
  "moderator",
  "official",
  "owner",
  "server",
  "system",
]);

export const callsignSchema = z
  .string()
  .trim()
  .min(CALLSIGN_MIN, "Callsign must be 3–16 characters.")
  .max(CALLSIGN_MAX, "Callsign must be 3–16 characters.")
  .regex(CALLSIGN_PATTERN, "Use letters, numbers, and underscores, starting with a letter.");

export function parseCallsign(raw: unknown): string {
  const parsed = callsignSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid callsign.", 400);
  }
  if (RESERVED_CALLSIGNS.has(parsed.data.toLowerCase())) {
    throw new GameError("VALIDATION_ERROR", "That callsign is reserved.", 400);
  }
  return parsed.data;
}
