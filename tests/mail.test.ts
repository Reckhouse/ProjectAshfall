import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { players } from "@/db/schema";
import { createAlliance, inviteToAlliance, loadAllianceDesk, respondToAllianceInvite } from "@/game/services/alliances";
import { claimCallsign } from "@/game/services/callsign";
import { loadMailDesk, markMailRead, sendMail } from "@/game/services/mail";
import { ensurePlayerProvisioned, getPlayerSnapshot } from "@/game/services/provision";
import { parseMailBody } from "@/lib/validation/mail";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

async function namedCommander(
  db: Awaited<ReturnType<typeof setupIsolatedGameDb>>["db"],
  authUserId: string,
  callsign: string,
) {
  await ensurePlayerProvisioned(db, authUserId, { rng: createSeededRng(authUserId) });
  await claimCallsign(db, authUserId, callsign);
}

describe("mail body", () => {
  it("trims and rejects empty or oversized text", () => {
    expect(parseMailBody("  Hold the ridge.  ")).toBe("Hold the ridge.");
    expect(() => parseMailBody("   ")).toThrow();
    expect(() => parseMailBody("x".repeat(281))).toThrow();
  });
});

describe("commander mail", () => {
  it("delivers a direct dispatch and marks it read for the recipient", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await namedCommander(db, "mail-a", "MailLead");
    await namedCommander(db, "mail-b", "MailMate");
    await namedCommander(db, "mail-bot", "MailBot");
    await db.update(players).set({ kind: "BOT" }).where(eq(players.authUserId, "mail-bot"));

    const actionId = crypto.randomUUID();
    const sent = await sendMail(db, "mail-a", {
      actionId,
      toCallsign: "mailmate",
      body: "Hold the south ridge.",
    });
    expect(sent.unreadCount).toBe(0);
    expect(sent.inbox[0]).toMatchObject({
      kind: "DIRECT",
      body: "Hold the south ridge.",
      you: true,
      read: true,
    });
    expect(sent.inbox[0]).not.toHaveProperty("fromPlayerId");
    expect(sent.inbox[0]).not.toHaveProperty("toPlayerId");

    const replayed = await sendMail(db, "mail-a", {
      actionId,
      toCallsign: "mailmate",
      body: "Hold the south ridge.",
    });
    expect(replayed).toEqual(sent);

    const inbox = await loadMailDesk(db, "mail-b");
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.inbox[0]).toMatchObject({
      kind: "DIRECT",
      fromCallsign: "MailLead",
      body: "Hold the south ridge.",
      read: false,
      you: false,
    });
    expect((await getPlayerSnapshot(db, "mail-b"))?.unreadMail).toBe(1);

    const read = await markMailRead(db, "mail-b", {
      actionId: crypto.randomUUID(),
      messageId: inbox.inbox[0]!.id,
    });
    expect(read.unreadCount).toBe(0);
    expect(read.inbox[0]?.read).toBe(true);
    expect((await getPlayerSnapshot(db, "mail-b"))?.unreadMail).toBe(0);

    await expect(
      sendMail(db, "mail-a", { actionId: crypto.randomUUID(), toCallsign: "MailLead", body: "loop" }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      sendMail(db, "mail-a", { actionId: crypto.randomUUID(), toCallsign: "MailBot", body: "ping" }),
    ).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(
      sendMail(db, "mail-a", { actionId: crypto.randomUUID(), channel: "ALLIANCE", body: "muster" }),
    ).rejects.toMatchObject({ code: "NOT_IN_ALLIANCE" });
    await client.close();
  });

  it("posts an alliance circular to current members only", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await namedCommander(db, "circ-a", "CircLead");
    await namedCommander(db, "circ-b", "CircMate");
    await namedCommander(db, "circ-c", "CircOut");

    await createAlliance(db, "circ-a", { actionId: crypto.randomUUID(), tag: "CIR", name: "Circle" });
    await inviteToAlliance(db, "circ-a", { actionId: crypto.randomUUID(), callsign: "CircMate" });
    const invite = (await loadAllianceDesk(db, "circ-b")).incoming[0]!;
    await respondToAllianceInvite(db, "circ-b", {
      actionId: crypto.randomUUID(),
      inviteId: invite.id,
      accept: true,
    });

    const posted = await sendMail(db, "circ-a", {
      actionId: crypto.randomUUID(),
      channel: "ALLIANCE",
      body: "Muster at first light.",
    });
    expect(posted.canPostAlliance).toBe(true);
    expect(posted.inbox[0]).toMatchObject({
      kind: "ALLIANCE",
      allianceTag: "CIR",
      body: "Muster at first light.",
      you: true,
      read: true,
    });

    const member = await loadMailDesk(db, "circ-b");
    expect(member.unreadCount).toBe(1);
    expect(member.inbox[0]).toMatchObject({
      kind: "ALLIANCE",
      fromCallsign: "CircLead",
      allianceTag: "CIR",
      read: false,
    });
    expect((await loadMailDesk(db, "circ-c")).inbox).toHaveLength(0);
    await client.close();
  });
});
