import { describe, expect, it } from "vitest";
import { GET as chunksGet } from "@/app/api/game/world/chunks/route";
import { GET as meGet } from "@/app/api/game/me/route";
import { POST as departPost } from "@/app/api/game/depart/route";
import { POST as movePost } from "@/app/api/game/move/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

async function registerCookie(email: string): Promise<string> {
  resetRateLimitsForTests();
  const register = await registerPost(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "password1",
        confirmPassword: "password1",
      }),
    }),
  );
  expect(register.status).toBe(201);
  return cookieFrom(register);
}

describe("phase 2 security boundaries", () => {
  it("rejects unauthenticated movement and chunk queries", async () => {
    const move = await movePost(
      new Request("http://localhost/api/game/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: "33333333-3333-4333-8333-333333333333",
          payload: { direction: "north" },
        }),
      }),
    );
    expect(move.status).toBe(401);

    const chunks = await chunksGet(new Request("http://localhost/api/game/world/chunks?cx=0&cy=0"));
    expect(chunks.status).toBe(401);
  });

  it("rejects client-supplied coordinates on move and depart", async () => {
    const cookie = await registerCookie("phase2-spoof@example.com");
    const spoofed = await movePost(
      new Request("http://localhost/api/game/move", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          actionId: "44444444-4444-4444-8444-444444444444",
          payload: { direction: "north" },
          x: 1,
          y: 1,
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const body = (await spoofed.json()) as { code: string };
    expect(body.code).toBe("INVALID_COMMAND");

    const departSpoof = await departPost(
      new Request("http://localhost/api/game/depart", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          actionId: "55555555-5555-4555-8555-555555555555",
          locationType: "FIELD",
        }),
      }),
    );
    expect(departSpoof.status).toBe(400);
  });

  it("cannot move from BASE without departing", async () => {
    const cookie = await registerCookie("phase2-base@example.com");
    const me = await meGet(new Request("http://localhost/api/game/me", { headers: { cookie } }));
    expect(me.ok).toBe(true);
    const moved = await movePost(
      new Request("http://localhost/api/game/move", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          actionId: "66666666-6666-4666-8666-666666666666",
          payload: { direction: "south" },
        }),
      }),
    );
    expect(moved.status).toBe(400);
    const body = (await moved.json()) as { code: string; message: string };
    expect(body.code).toBe("INVALID_COMMAND");
    expect(body.message).toMatch(/leave the base/i);
  });
});
