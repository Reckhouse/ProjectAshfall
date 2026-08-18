import { createHash } from "node:crypto";

export function createId(): string {
  return crypto.randomUUID();
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
