import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUserAccount } from "@/lib/auth/service";
import { registerSchema } from "@/lib/validation/auth";
import { getServerEnv } from "@/lib/env";
import { isUniqueViolation } from "@/game/services/spawn";
import { GameError } from "@/game/domain/errors";
import { setupIsolatedGameDb } from "./helpers/db";

describe("auth helpers", () => {
  it("hashes passwords and verifies them without storing plaintext", async () => {
    const stored = await hashPassword("password1");
    expect(stored).not.toContain("password1");
    expect(await verifyPassword("password1", stored)).toBe(true);
    expect(await verifyPassword("password2", stored)).toBe(false);
  });

  it("rejects invalid registration payloads", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "short",
      confirmPassword: "other",
    });
    expect(result.success).toBe(false);
  });

  it("requires AUTH_SECRET in production runtime", () => {
    expect(() =>
      getServerEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://user:pass@ep-test.neon.tech/neondb",
      }),
    ).toThrow(/AUTH_SECRET/);
  });

  it("allows production builds without AUTH_SECRET so Vercel can compile", () => {
    const env = getServerEnv({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      DATABASE_URL: "postgres://user:pass@ep-test.neon.tech/neondb",
    });
    expect(env.isNeon).toBe(true);
    expect(env.authSecret.length).toBeGreaterThan(0);
  });

  it("detects unique violations wrapped by Drizzle/Neon cause chains", () => {
    const nested = { cause: { code: "23505", message: "duplicate key value violates unique constraint" } };
    expect(isUniqueViolation(nested)).toBe(true);
    expect(isUniqueViolation(new Error("nope"))).toBe(false);
  });

  it("rejects a second account with the same email without surfacing an internal error", async () => {
    const { db, client } = await setupIsolatedGameDb();
    try {
      await createUserAccount(db, { email: "same@ashfall.test", password: "password1" });
      await expect(
        createUserAccount(db, { email: "same@ashfall.test", password: "password1" }),
      ).rejects.toMatchObject({
        code: "ACCOUNT_CREATE_FAILED",
      } satisfies Partial<GameError>);
    } finally {
      await client.close();
    }
  });
});
