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

describe("phase 4 security boundaries", () => {
  it("rejects unauthenticated cave clears", async () => {
    const response = await clearCavePost(
      new Request("http://localhost/api/game/clear-cave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: "77777777-7777-4777-8777-777777777777",
          payload: { caveId: "88888888-8888-4888-8888-888888888888" },
        }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects client-supplied tool loot on cave clear", async () => {
    resetRateLimitsForTests();
    const register = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "cave-spoof@example.com",
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
          actionId: "99999999-9999-4999-8999-999999999999",
          payload: {
            caveId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            tier: 5,
            bonusBps: 9000,
            affinity: "METAL",
          },
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const body = (await spoofed.json()) as { code: string };
    expect(body.code).toBe("INVALID_COMMAND");
  });
});
