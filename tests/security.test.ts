import { describe, expect, it } from "vitest";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as meGet } from "@/app/api/game/me/route";
import { POST as provisionPost } from "@/app/api/game/provision/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 1 security boundaries", () => {
  it("rejects provisioning without a session", async () => {
    resetRateLimitsForTests();
    const response = await provisionPost(
      new Request("http://localhost/api/game/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("rejects client-supplied coordinates and resource totals", async () => {
    resetRateLimitsForTests();
    const register = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "spoof@example.com",
          password: "password1",
          confirmPassword: "password1",
        }),
      }),
    );
    expect(register.status).toBe(201);
    const cookie = cookieFrom(register);

    const spoofed = await provisionPost(
      new Request("http://localhost/api/game/provision", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "11111111-1111-4111-8111-111111111111",
          x: 1,
          y: 1,
          energy: 99999,
          metal: 99999,
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const body = (await spoofed.json()) as { code: string };
    expect(body.code).toBe("INVALID_COMMAND");
  });

  it("replays provision safely and keeps the same base", async () => {
    resetRateLimitsForTests();
    const register = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "replay@example.com",
          password: "password1",
          confirmPassword: "password1",
        }),
      }),
    );
    const cookie = cookieFrom(register);
    const action = {
      actionId: "22222222-2222-4222-8222-222222222222",
    };

    const first = await provisionPost(
      new Request("http://localhost/api/game/provision", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(action),
      }),
    );
    const second = await provisionPost(
      new Request("http://localhost/api/game/provision", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify(action),
      }),
    );

    const firstBody = (await first.json()) as { player: { base: { x: number; y: number }; resources: { energy: number } } };
    const secondBody = (await second.json()) as { player: { base: { x: number; y: number }; resources: { energy: number } } };
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(secondBody.player.base).toEqual(firstBody.player.base);
    expect(secondBody.player.resources.energy).toBe(250);
  });

  it("does not leak whether an email exists on login failure", async () => {
    resetRateLimitsForTests();
    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "missing@example.com", password: "password1" }),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { message: string; code: string };
    expect(body.code).toBe("INVALID_CREDENTIALS");
    expect(body.message).toBe("Invalid email or password.");
  });

  it("requires auth for the snapshot endpoint", async () => {
    const response = await meGet(new Request("http://localhost/api/game/me"));
    expect(response.status).toBe(401);
  });
});
