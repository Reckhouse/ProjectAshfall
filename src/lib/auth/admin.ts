import { GameError } from "@/game/domain/errors";
import { getServerEnv } from "@/lib/env";
import type { AuthUser } from "@/lib/auth/session";

export function isAdminEmail(email: string | null | undefined, source: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) {
    return false;
  }
  return getServerEnv(source).adminEmails.includes(email.trim().toLowerCase());
}

export function isAdminUser(user: AuthUser | null | undefined, source: NodeJS.ProcessEnv = process.env): boolean {
  if (!user) {
    return false;
  }
  return user.isAdmin || isAdminEmail(user.email, source);
}

export function assertAdmin(user: AuthUser | null): AuthUser {
  if (!user) {
    throw new GameError("AUTH_REQUIRED", "Sign in required.", 401);
  }
  if (!isAdminUser(user)) {
    throw new GameError("ADMIN_REQUIRED", "Admin access is restricted.", 403);
  }
  return user;
}

export function cronSecretAuthorized(request: Request, source: NodeJS.ProcessEnv = process.env): boolean {
  const secret = getServerEnv(source).cronSecret;
  if (secret) {
    const authorization = request.headers.get("authorization");
    if (authorization === `Bearer ${secret}`) {
      return true;
    }
    if (request.headers.get("x-cron-secret") === secret) {
      return true;
    }
  }
  const vercelEnv = source.VERCEL_ENV;
  return (
    (vercelEnv === "production" || vercelEnv === "preview") && request.headers.get("x-vercel-cron") === "1"
  );
}
