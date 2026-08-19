import { z } from "zod";
import { GameError } from "@/game/domain/errors";
import { balanceV1 } from "@/game/config/balance.v1";

export const ALLIANCE_TAG_PATTERN = /^[A-Za-z][A-Za-z0-9]{2,4}$/;
export const ALLIANCE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9 _-]{2,23}$/;

const RESERVED_TAGS = new Set(["adm", "admin", "bot", "gm", "mod", "sys", "system"]);

export const allianceTagSchema = z
  .string()
  .trim()
  .min(balanceV1.alliances.tagMin, "Tag must be 3–5 characters.")
  .max(balanceV1.alliances.tagMax, "Tag must be 3–5 characters.")
  .regex(ALLIANCE_TAG_PATTERN, "Use letters and numbers, starting with a letter.");

export const allianceNameSchema = z
  .string()
  .trim()
  .min(balanceV1.alliances.nameMin, "Name must be 3–24 characters.")
  .max(balanceV1.alliances.nameMax, "Name must be 3–24 characters.")
  .regex(ALLIANCE_NAME_PATTERN, "Use letters, numbers, spaces, underscores, or hyphens.");

export function parseAllianceTag(raw: unknown): string {
  const parsed = allianceTagSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid alliance tag.", 400);
  }
  const tag = parsed.data.toUpperCase();
  if (RESERVED_TAGS.has(tag.toLowerCase())) {
    throw new GameError("VALIDATION_ERROR", "That alliance tag is reserved.", 400);
  }
  return tag;
}

export function parseAllianceName(raw: unknown): string {
  const parsed = allianceNameSchema.safeParse(raw);
  if (!parsed.success) {
    throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid alliance name.", 400);
  }
  return parsed.data.replace(/\s+/g, " ").trim();
}
