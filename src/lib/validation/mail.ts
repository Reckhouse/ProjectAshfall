import { z } from "zod";
import { balanceV1 } from "@/game/config/balance.v1";
import { GameError } from "@/game/domain/errors";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const mailBodySchema = z
  .string()
  .transform((value) => value.replace(/\r\n/g, "\n").replace(CONTROL_CHARS, "").replace(/[ \t]+\n/g, "\n").trim())
  .pipe(
    z
      .string()
      .min(balanceV1.mail.bodyMin, "Message cannot be empty.")
      .max(balanceV1.mail.bodyMax, `Message must be ${balanceV1.mail.bodyMax} characters or fewer.`),
  );

export function parseMailBody(raw: unknown): string {
  const parsed = mailBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw new GameError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid message.", 400);
  }
  return parsed.data;
}
