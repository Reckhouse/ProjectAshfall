import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { registerSchema } from "@/lib/validation/auth";
import { getServerEnv } from "@/lib/env";

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
});
