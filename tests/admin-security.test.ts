import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { GET as adminStatsGet } from "@/app/api/admin/stats/route";
import { POST as adminBotsPost } from "@/app/api/admin/bots/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as cronBotsGet } from "@/app/api/cron/bots/route";
import { getDb } from "@/db/client";
import { authUsers } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

async function registerAccount(email: string, callsign?: string) {
  resetRateLimitsForTests();
  return registerPost(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password1",
        confirmPassword: "password1",
        ...(callsign ? { callsign } : {}),
      }),
    }),
  );
}

describe("admin security boundaries", () => {
  const previous = process.env.ADMIN_EMAILS;

  beforeAll(() => {
    process.env.ADMIN_EMAILS = "keeper@ashfall.test";
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env.ADMIN_EMAILS;
    } else {
      process.env.ADMIN_EMAILS = previous;
    }
  });
  it("rejects unauthenticated and non-admin admin routes", async () => {
    const unauth = await adminStatsGet(new Request("http://localhost/api/admin/stats"));
    expect(unauth.status).toBe(401);

    const registered = await registerAccount("player@ashfall.test", "Normie");
    expect(registered.status).toBe(201);
    const forbidden = await adminStatsGet(
      new Request("http://localhost/api/admin/stats", {
        headers: { cookie: cookieFrom(registered) },
      }),
    );
    expect(forbidden.status).toBe(403);
    const body = (await forbidden.json()) as { code: string };
    expect(body.code).toBe("ADMIN_REQUIRED");
  });

  it("allows only the configured admin to spawn bots", async () => {
    const admin = await registerAccount("keeper@ashfall.test", "Keeper");
    expect(admin.status).toBe(201);
    const spawned = await adminBotsPost(
      new Request("http://localhost/api/admin/bots", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cookieFrom(admin) },
        body: JSON.stringify({ callsign: "AshBot01", difficulty: "SCOUT" }),
      }),
    );
    expect(spawned.status).toBe(201);
    const body = (await spawned.json()) as { bot: { displayName: string; difficulty: string } };
    expect(body.bot.displayName).toBe("AshBot01");
    expect(body.bot.difficulty).toBe("SCOUT");

    const cron = await cronBotsGet(new Request("http://localhost/api/cron/bots"));
    expect(cron.status).toBe(401);
  });

  it("grants admin when the account flag is set even if the email is not listed", async () => {
    const registered = await registerAccount("flagged@ashfall.test", "Flagged");
    expect(registered.status).toBe(201);
    const db = await getDb();
    await db.update(authUsers).set({ isAdmin: true }).where(eq(authUsers.email, "flagged@ashfall.test"));

    const allowed = await adminStatsGet(
      new Request("http://localhost/api/admin/stats", {
        headers: { cookie: cookieFrom(registered) },
      }),
    );
    expect(allowed.status).toBe(200);
  });
});
