import { describe, expect, it } from "vitest";
import { GET as mailGet, POST as mailPost } from "@/app/api/game/mail/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 10 security boundaries", () => {
  it("requires a session and rejects client-owned mail payloads", async () => {
    resetRateLimitsForTests();
    const unauthGet = await mailGet(new Request("http://localhost/api/game/mail"));
    expect(unauthGet.status).toBe(401);

    const unauthPost = await mailPost(
      new Request("http://localhost/api/game/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          payload: { toCallsign: "Nobody", body: "hello" },
        }),
      }),
    );
    expect(unauthPost.status).toBe(401);

    const registered = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "mail-spoof@ashfall.test",
          password: "password1",
          confirmPassword: "password1",
          callsign: "SpoofMail",
        }),
      }),
    );
    expect(registered.status).toBe(201);
    const cookie = cookieFrom(registered);

    const spoofed = await mailPost(
      new Request("http://localhost/api/game/mail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          payload: {
            toCallsign: "Nobody",
            body: "hello",
            playerId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            fromPlayerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            unreadCount: 0,
          },
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const spoofBody = (await spoofed.json()) as { code: string };
    expect(spoofBody.code).toBe("INVALID_COMMAND");

    const allowed = await mailGet(
      new Request("http://localhost/api/game/mail", {
        headers: { cookie },
      }),
    );
    expect(allowed.status).toBe(200);
    const body = (await allowed.json()) as { mail: { unreadCount: number; inbox: unknown[] } };
    expect(body.mail.unreadCount).toBe(0);
    expect(body.mail.inbox).toEqual([]);
  });
});
