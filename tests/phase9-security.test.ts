import { describe, expect, it } from "vitest";
import { GET as allianceGet, POST as alliancePost } from "@/app/api/game/alliance/route";
import { POST as invitePost } from "@/app/api/game/alliance/invite/route";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { resetRateLimitsForTests } from "@/lib/security/rate-limit";

function cookieFrom(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? `${SESSION_COOKIE}=${match[1]}` : "";
}

describe("phase 9 security boundaries", () => {
  it("requires a session and rejects client-owned alliance payloads", async () => {
    resetRateLimitsForTests();
    const unauthGet = await allianceGet(new Request("http://localhost/api/game/alliance"));
    expect(unauthGet.status).toBe(401);

    const unauthPost = await alliancePost(
      new Request("http://localhost/api/game/alliance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          payload: { tag: "SEC", name: "Security" },
        }),
      }),
    );
    expect(unauthPost.status).toBe(401);

    const registered = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "alliance-spoof@ashfall.test",
          password: "password1",
          confirmPassword: "password1",
          callsign: "SpoofAlly",
        }),
      }),
    );
    expect(registered.status).toBe(201);
    const cookie = cookieFrom(registered);

    const spoofed = await alliancePost(
      new Request("http://localhost/api/game/alliance", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          payload: {
            tag: "SEC",
            name: "Security",
            allianceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            playerId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            role: "LEADER",
          },
        }),
      }),
    );
    expect(spoofed.status).toBe(400);
    const spoofBody = (await spoofed.json()) as { code: string };
    expect(spoofBody.code).toBe("INVALID_COMMAND");

    const invited = await invitePost(
      new Request("http://localhost/api/game/alliance/invite", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          payload: {
            callsign: "Nobody",
            playerId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
          },
        }),
      }),
    );
    expect(invited.status).toBe(400);

    const created = await alliancePost(
      new Request("http://localhost/api/game/alliance", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          actionId: "99999999-9999-4999-8999-999999999999",
          payload: { tag: "SEC", name: "Security" },
        }),
      }),
    );
    expect(created.status).toBe(201);
    const body = (await created.json()) as {
      alliance: { alliance: { tag: string; members: Array<Record<string, unknown>> } };
    };
    expect(body.alliance.alliance.tag).toBe("SEC");
    expect(body.alliance.alliance.members[0]).not.toHaveProperty("playerId");
    expect(body.alliance.alliance.members[0]).not.toHaveProperty("allianceId");
  });
});
