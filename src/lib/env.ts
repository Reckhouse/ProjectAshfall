import { z } from "zod";
import { GameError } from "@/game/domain/errors";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  APP_ORIGIN: z.url().optional(),
  WORLD_SEED: z.string().min(8).optional(),
  NEXT_PHASE: z.string().optional(),
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  ADMIN_EMAILS: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

const DEFAULT_ADMIN_EMAIL = "mthrun@uccs.edu";

export type ServerEnv = {
  nodeEnv: "development" | "test" | "production";
  databaseUrl: string;
  authSecret: string;
  appOrigin: string;
  worldSeed: string;
  adminEmails: string[];
  cronSecret: string | null;
  isPglite: boolean;
  isNeon: boolean;
};

function parseAdminEmails(raw: string | undefined, nodeEnv: ServerEnv["nodeEnv"]): string[] {
  const listed = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (listed.length > 0) {
    return [...new Set(listed)];
  }
  if (nodeEnv === "test") {
    return [];
  }
  return [DEFAULT_ADMIN_EMAIL];
}

function defaultDatabaseUrl(): string {
  return "pglite:.data/ashfall.db";
}

function isBuildPhase(source: NodeJS.ProcessEnv): boolean {
  return source.NEXT_PHASE === "phase-production-build";
}

function resolveAuthSecret(
  nodeEnv: ServerEnv["nodeEnv"],
  raw: string | undefined,
  source: NodeJS.ProcessEnv,
): string {
  if (raw && raw.length >= 32) {
    return raw;
  }
  if (nodeEnv === "production" && !isBuildPhase(source)) {
    throw new GameError(
      "INTERNAL_GAME_ERROR",
      "AUTH_SECRET must be set to a 32+ character value in production.",
      500,
    );
  }
  return "dev-only-ashfall-auth-secret-value!";
}

export function getServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new GameError("INTERNAL_GAME_ERROR", "Server environment is invalid.", 500);
  }

  const nodeEnv = parsed.data.NODE_ENV ?? "development";
  const databaseUrl = parsed.data.DATABASE_URL ?? defaultDatabaseUrl();
  const isPglite = databaseUrl.startsWith("pglite:");
  const isNeon =
    databaseUrl.includes("neon.tech") ||
    databaseUrl.includes("neon.build") ||
    Boolean(parsed.data.VERCEL_ENV && !isPglite);

  if (nodeEnv === "production" && !isPglite && !isBuildPhase(source) && !databaseUrl.startsWith("postgres")) {
    throw new GameError("INTERNAL_GAME_ERROR", "DATABASE_URL must be a Neon/Postgres URL in production.", 500);
  }

  return {
    nodeEnv,
    databaseUrl,
    authSecret: resolveAuthSecret(nodeEnv, parsed.data.AUTH_SECRET, source),
    appOrigin: parsed.data.APP_ORIGIN ?? "http://localhost:3000",
    worldSeed: parsed.data.WORLD_SEED ?? "ashfall-world-seed-v1-server-only",
    adminEmails: parseAdminEmails(parsed.data.ADMIN_EMAILS, nodeEnv),
    cronSecret:
      parsed.data.CRON_SECRET && parsed.data.CRON_SECRET.length >= 16 ? parsed.data.CRON_SECRET : null,
    isPglite,
    isNeon,
  };
}

export function pgliteDataDir(databaseUrl: string): string {
  if (!databaseUrl.startsWith("pglite:")) {
    throw new Error("Not a pglite database URL");
  }
  const location = databaseUrl.slice("pglite:".length);
  return location.length > 0 ? location : ".data/ashfall.db";
}
