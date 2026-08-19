import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { allianceMembers, alliances, bases, players } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import {
  createAlliance,
  inviteToAlliance,
  kickAllianceMember,
  leaveAlliance,
  loadAllianceDesk,
  respondToAllianceInvite,
} from "@/game/services/alliances";
import { claimCallsign } from "@/game/services/callsign";
import { getVisibleChunks } from "@/game/services/chunks";
import { departBase } from "@/game/services/move";
import { ensurePlayerProvisioned, getPlayerSnapshot } from "@/game/services/provision";
import { raidBase } from "@/game/services/raid";
import { loadWorldStandings } from "@/game/services/standings";
import { parseAllianceTag } from "@/lib/validation/alliance";
import { chunkCoord } from "@/game/world/chunks";
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

async function agePlayer(
  db: Awaited<ReturnType<typeof setupIsolatedGameDb>>["db"],
  authUserId: string,
  ageMs: number,
) {
  await db
    .update(players)
    .set({ createdAt: new Date(Date.now() - ageMs) })
    .where(eq(players.authUserId, authUserId));
}

describe("alliance tags", () => {
  it("normalizes tags and rejects reserved ones", () => {
    expect(parseAllianceTag("ash")).toBe("ASH");
    expect(() => parseAllianceTag("ADM")).toThrowError(/reserved/i);
    expect(() => parseAllianceTag("AB")).toThrow();
  });
});

describe("alliances", () => {
  it("founds a unique tag, invites by callsign, and blocks allied raids", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await namedCommander(db, "ally-a", "AshLeader");
    await namedCommander(db, "ally-b", "AshMember");
    await namedCommander(db, "ally-c", "AshRival");

    const createActionId = crypto.randomUUID();
    const created = await createAlliance(db, "ally-a", {
      actionId: createActionId,
      tag: "ash",
      name: "Ash Company",
    });
    expect(created.alliance).toMatchObject({ tag: "ASH", name: "Ash Company", role: "LEADER" });
    expect(created.alliance?.members).toEqual([
      { callsign: "AshLeader", role: "LEADER", you: true },
    ]);

    const replayed = await createAlliance(db, "ally-a", {
      actionId: createActionId,
      tag: "ASH",
      name: "Ash Company",
    });
    expect(replayed).toEqual(created);

    await expect(
      createAlliance(db, "ally-c", { actionId: crypto.randomUUID(), tag: "ASH", name: "Copy" }),
    ).rejects.toMatchObject({ code: "TAG_TAKEN" });

    const invited = await inviteToAlliance(db, "ally-a", {
      actionId: crypto.randomUUID(),
      callsign: "ashmember",
    });
    expect(invited.outgoing.map((row) => row.callsign)).toEqual(["AshMember"]);

    const incoming = await loadAllianceDesk(db, "ally-b");
    expect(incoming.incoming[0]).toMatchObject({ tag: "ASH", fromCallsign: "AshLeader" });
    const joined = await respondToAllianceInvite(db, "ally-b", {
      actionId: crypto.randomUUID(),
      inviteId: incoming.incoming[0]!.id,
      accept: true,
    });
    expect(joined.alliance?.role).toBe("MEMBER");
    expect(joined.alliance?.members.map((row) => row.callsign).sort()).toEqual(["AshLeader", "AshMember"]);

    const snapshot = await getPlayerSnapshot(db, "ally-b");
    expect(snapshot?.alliance).toEqual({ tag: "ASH", name: "Ash Company", role: "MEMBER" });

    const standings = await loadWorldStandings(db, { viewerAuthUserId: "ally-a" });
    expect(standings.board.find((row) => row.callsign === "AshLeader")).toMatchObject({ allianceTag: "ASH" });
    expect(standings.board.find((row) => row.callsign === "AshRival")).toMatchObject({ allianceTag: null });

    const [leader] = await db.select().from(players).where(eq(players.authUserId, "ally-a"));
    const [member] = await db.select().from(players).where(eq(players.authUserId, "ally-b"));
    const [memberBase] = await db.select().from(bases).where(eq(bases.playerId, member!.id));
    const nextX = leader!.x! >= 2047 ? leader!.x! - 1 : leader!.x! + 1;
    await db.update(bases).set({ x: nextX, y: leader!.y! }).where(eq(bases.id, memberBase!.id));
    const view = await getVisibleChunks(db, "ally-a", {
      chunkX: chunkCoord(leader!.x!),
      chunkY: chunkCoord(leader!.y!),
    });
    const alliedBase = view.bases.find((base) => !base.owned);
    expect(alliedBase).toMatchObject({ allianceTag: "ASH", allied: true });
    expect(alliedBase).not.toHaveProperty("allianceId");
    expect(alliedBase).not.toHaveProperty("playerId");

    await agePlayer(db, "ally-b", balanceV1.pvp.newPlayerProtectionMs + 60_000);
    await departBase(db, "ally-a", crypto.randomUUID(), 2);
    await db
      .update(players)
      .set({ x: nextX, y: leader!.y!, locationType: "FIELD" })
      .where(eq(players.authUserId, "ally-a"));
    const [movedBase] = await db.select().from(bases).where(eq(bases.playerId, member!.id));
    await expect(
      raidBase(db, "ally-a", { actionId: crypto.randomUUID(), targetBaseId: movedBase!.id }),
    ).rejects.toMatchObject({ code: "ALLIED_TARGET" });

    await client.close();
  });

  it("lets the leader dismiss a member and transfers lead when the leader leaves", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await namedCommander(db, "kick-a", "KickLead");
    await namedCommander(db, "kick-b", "KickMate");
    await namedCommander(db, "kick-c", "KickSpare");

    await createAlliance(db, "kick-a", { actionId: crypto.randomUUID(), tag: "KCK", name: "Kick Co" });
    await inviteToAlliance(db, "kick-a", { actionId: crypto.randomUUID(), callsign: "KickMate" });
    const invite = (await loadAllianceDesk(db, "kick-b")).incoming[0]!;
    await respondToAllianceInvite(db, "kick-b", {
      actionId: crypto.randomUUID(),
      inviteId: invite.id,
      accept: true,
    });

    const kicked = await kickAllianceMember(db, "kick-a", {
      actionId: crypto.randomUUID(),
      callsign: "KickMate",
    });
    expect(kicked.alliance?.members.map((row) => row.callsign)).toEqual(["KickLead"]);
    expect((await loadAllianceDesk(db, "kick-b")).alliance).toBeNull();
    await expect(
      kickAllianceMember(db, "kick-b", { actionId: crypto.randomUUID(), callsign: "KickLead" }),
    ).rejects.toMatchObject({ code: "NOT_ALLIANCE_LEADER" });

    await inviteToAlliance(db, "kick-a", { actionId: crypto.randomUUID(), callsign: "KickSpare" });
    const spareInvite = (await loadAllianceDesk(db, "kick-c")).incoming[0]!;
    await respondToAllianceInvite(db, "kick-c", {
      actionId: crypto.randomUUID(),
      inviteId: spareInvite.id,
      accept: true,
    });
    await leaveAlliance(db, "kick-a", { actionId: crypto.randomUUID() });
    const afterLead = await loadAllianceDesk(db, "kick-c");
    expect(afterLead.alliance).toMatchObject({ tag: "KCK", role: "LEADER" });
    expect((await loadAllianceDesk(db, "kick-a")).alliance).toBeNull();

    await leaveAlliance(db, "kick-c", { actionId: crypto.randomUUID() });
    expect((await loadAllianceDesk(db, "kick-c")).alliance).toBeNull();
    const leftover = await db.select().from(alliances);
    const leftoverMembers = await db.select().from(allianceMembers);
    expect(leftover).toHaveLength(0);
    expect(leftoverMembers).toHaveLength(0);
    await client.close();
  });
});
