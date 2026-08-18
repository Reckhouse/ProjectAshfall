type LogFields = {
  event: string;
  actionId?: string;
  playerId?: string;
  authUserId?: string;
  commandType?: string;
  code?: string;
  latencyMs?: number;
  balanceVersion?: number;
  attempts?: number;
  worldSlug?: string;
  amount?: number;
};

function redact(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const lower = value.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("token") ||
    lower.includes("cookie") ||
    lower.includes("postgres://") ||
    lower.includes("postgresql://")
  ) {
    return "[redacted]";
  }
  return value;
}

export function logEvent(fields: LogFields): void {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      payload[key] = redact(value);
    }
  }
  console.info(JSON.stringify({ source: "ashfall", ...payload }));
}
