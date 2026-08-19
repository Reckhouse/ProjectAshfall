import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { authSessions, authUsers } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { sha256Hex } from "@/lib/ids";
import { getServerEnv } from "@/lib/env";

export const SESSION_COOKIE = "ashfall_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  email: string;
  isAdmin: boolean;
};

function cookieSettings(expires: Date) {
  const env = getServerEnv();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.nodeEnv === "production",
    path: "/",
    expires,
  };
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueSession(
  db: AppDb,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(authSessions).values({
    userId,
    tokenHash: sha256Hex(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export function applySessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(SESSION_COOKIE, token, cookieSettings(expiresAt));
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", cookieSettings(new Date(0)));
}

export async function revokeSessionByToken(db: AppDb, token: string | null): Promise<void> {
  if (!token) {
    return;
  }
  await db.delete(authSessions).where(eq(authSessions.tokenHash, sha256Hex(token)));
}

export function readSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(SESSION_COOKIE.length + 1)) : null;
}

export async function getAuthUserByToken(db: AppDb, token: string | null): Promise<AuthUser | null> {
  if (!token) {
    return null;
  }

  const [session] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.tokenHash, sha256Hex(token)))
    .limit(1);

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    if (session) {
      await db.delete(authSessions).where(eq(authSessions.id, session.id));
    }
    return null;
  }

  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, session.userId)).limit(1);
  return user ? { id: user.id, email: user.email, isAdmin: user.isAdmin } : null;
}

export async function getCurrentAuthUser(db: AppDb): Promise<AuthUser | null> {
  const jar = await cookies();
  return getAuthUserByToken(db, jar.get(SESSION_COOKIE)?.value ?? null);
}

export async function getAuthUserFromRequest(db: AppDb, request: Request): Promise<AuthUser | null> {
  return getAuthUserByToken(db, readSessionTokenFromCookieHeader(request.headers.get("cookie")));
}
