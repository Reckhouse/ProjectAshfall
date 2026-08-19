import { describe, expect, it } from "vitest";
import { POST as raidPost } from "@/app/api/game/raid/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 7 security boundaries", () => {
  it("rejects client-supplied raid loot and combat outcome", async () => {
    resetRateLimitsForTests();
    const register = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "raid-spoof@example.com",
          password: "password1",
          confirmPassword: "password1",
        }),
      }),
    );
    expect(register.status).toBe(201);

    const spoofed = await raidPost(
      new Request("http://localhost/api/game/raid", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieFrom(register),
        },
        body: JSON.stringify({
          actionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          payload: {
            targetBaseId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            outcome: "ATTACKER_WIN",
            loot: { energy: 999, metal: 999 },
            energyLooted: 999,
          },
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const body = (await spoofed.json()) as { code: string };
    expect(body.code).toBe("INVALID_COMMAND");
  });
});
