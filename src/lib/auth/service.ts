import { eq } from "drizzle-orm";
import { authUsers } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { GameError } from "@/game/domain/errors";
import { isUniqueViolation } from "@/game/services/spawn";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { logEvent } from "@/lib/logging";

export async function createUserAccount(
  db: AppDb,
  input: { email: string; password: string },
): Promise<{ id: string; email: string }> {
  const [existing] = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, input.email))
    .limit(1);
  if (existing) {
    throw new GameError("ACCOUNT_CREATE_FAILED", "Unable to create that account.", 400);
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(authUsers)
      .values({
        email: input.email,
        passwordHash,
      })
      .returning();
    if (!user) {
      throw new GameError("ACCOUNT_CREATE_FAILED", "Unable to create that account.", 400);
    }
    logEvent({ event: "auth.register.success", authUserId: user.id });
    return { id: user.id, email: user.email };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new GameError("ACCOUNT_CREATE_FAILED", "Unable to create that account.", 400);
    }
    throw error;
  }
}

export async function authenticateUser(
  db: AppDb,
  input: { email: string; password: string },
): Promise<{ id: string; email: string }> {
  const [user] = await db.select().from(authUsers).where(eq(authUsers.email, input.email)).limit(1);
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new GameError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
  }
  logEvent({ event: "auth.login.success", authUserId: user.id });
  return { id: user.id, email: user.email };
}
