import { describe, expect, it } from "vitest";
import { GET as standingsGet, POST as standingsPost } from "@/app/api/game/standings/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 8 security boundaries", () => {
  it("requires a session and rejects client-owned ranking payloads", async () => {
    resetRateLimitsForTests();
    const unauth = await standingsGet(new Request("http://localhost/api/game/standings"));
    expect(unauth.status).toBe(401);

    const registered = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "standings-spoof@ashfall.test",
          password: "password1",
          confirmPassword: "password1",
          callsign: "SpoofRank",
        }),
      }),
    );
    expect(registered.status).toBe(201);

    const spoofed = await standingsPost(
      new Request("http://localhost/api/game/standings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieFrom(registered),
        },
        body: JSON.stringify({
          rank: 1,
          score: 99999,
          raidWins: 50,
          energy: 8000,
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const spoofBody = (await spoofed.json()) as { code: string };
    expect(spoofBody.code).toBe("INVALID_COMMAND");

    const allowed = await standingsGet(
      new Request("http://localhost/api/game/standings", {
        headers: { cookie: cookieFrom(registered) },
      }),
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as {
      standings: { you: { callsign: string; rank: number }; board: Array<Record<string, unknown>> };
    };
    expect(body.standings.you.callsign).toBe("SpoofRank");
    expect(body.standings.you.rank).toBeGreaterThan(0);
    expect(body.standings.board[0]).not.toHaveProperty("playerId");
    expect(body.standings.board[0]).not.toHaveProperty("energy");
    expect(body.standings.board[0]).not.toHaveProperty("x");
  });
});
