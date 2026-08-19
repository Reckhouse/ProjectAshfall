import { describe, expect, it } from "vitest";
import { POST as clearCavePost } from "@/app/api/game/clear-cave/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 6 security boundaries", () => {
  it("rejects client-supplied combat outcomes on cave clear", async () => {
    resetRateLimitsForTests();
    const register = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "combat-spoof@example.com",
          password: "password1",
          confirmPassword: "password1",
        }),
      }),
    );
    expect(register.status).toBe(201);
    const cookie = cookieFrom(register);

    const spoofed = await clearCavePost(
      new Request("http://localhost/api/game/clear-cave", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          payload: {
            caveId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            outcome: "ATTACKER_WIN",
            casualties: 0,
            attackerCasualties: 0,
          },
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const body = (await spoofed.json()) as { code: string };
    expect(body.code).toBe("INVALID_COMMAND");
  });
});
