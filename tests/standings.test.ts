import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { bases, battleReports, players } from "@/db/schema";
import { balanceV1 } from "@/game/config/balance.v1";
import { claimCallsign } from "@/game/services/callsign";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { compareStandings, loadWorldStandings, standingScore } from "@/game/services/standings";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("standing score", () => {
  it("uses centralized ranking weights and ignores private stockpiles", () => {
    const weights = balanceV1.rankings.weights;
    expect(
      standingScore({
        baseLevel: 2,
        storageLevel: 3,
        raidWins: 1,
        caveClears: 4,
        energyLooted: 12,
        metalLooted: 18,
      }),
    ).toBe(
      2 * weights.baseLevel +
        3 * weights.storageLevel +
        1 * weights.raidWin +
        4 * weights.caveClear +
        12 * weights.energyLoot +
        18 * weights.metalLoot,
    );
  });

  it("ranks higher raid records ahead of equal upgrade scores", () => {
    const left = {
      playerId: "a",
      authUserId: "a",
      callsign: "Zulu",
      kind: "HUMAN" as const,
      allianceTag: null,
      baseLevel: 1,
      storageLevel: 1,
      raidWins: 2,
      caveClears: 0,
      energyLooted: 0,
      metalLooted: 0,
    };
    const right = {
      ...left,
      playerId: "b",
      authUserId: "b",
      callsign: "Alpha",
      raidWins: 0,
    };
    expect(compareStandings(left, right)).toBeLessThan(0);
  });
});

describe("world standings", () => {
  it("ranks named commanders without exposing coordinates or stockpiles", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "stand-a", { rng: createSeededRng("stand-a") });
    await ensurePlayerProvisioned(db, "stand-b", { rng: createSeededRng("stand-b") });
    await ensurePlayerProvisioned(db, "stand-anon", { rng: createSeededRng("stand-anon") });
    await claimCallsign(db, "stand-a", "AshAlpha");
    await claimCallsign(db, "stand-b", "AshBravo");

    const [bravo] = await db.select().from(players).where(eq(players.authUserId, "stand-b"));
    await db.update(bases).set({ level: 4 }).where(eq(bases.playerId, bravo!.id));

    const standings = await loadWorldStandings(db, { viewerAuthUserId: "stand-a" });
    expect(standings.commanderCount).toBe(2);
    expect(standings.board.map((row) => row.callsign)).toEqual(["AshBravo", "AshAlpha"]);
    expect(standings.board[0]).toMatchObject({
      rank: 1,
      callsign: "AshBravo",
      you: false,
      baseLevel: 4,
      allianceTag: null,
    });
    expect(standings.you).toMatchObject({ rank: 2, callsign: "AshAlpha", you: true });
    const limited = await loadWorldStandings(db, { viewerAuthUserId: "stand-a", boardLimit: 1 });
    expect(limited.board.map((row) => row.callsign)).toEqual(["AshBravo", "AshAlpha"]);
    expect(limited.board[1]).toMatchObject({ you: true, rank: 2 });
    expect(standings.board[0]).not.toHaveProperty("playerId");
    expect(standings.board[0]).not.toHaveProperty("x");
    expect(standings.board[0]).not.toHaveProperty("energy");
    expect(standings.board[0]).not.toHaveProperty("metal");
    await client.close();
  });

  it("counts raid victories in score and publishes intel without loot", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "raid-board-a", { rng: createSeededRng("raid-board-a") });
    await ensurePlayerProvisioned(db, "raid-board-b", { rng: createSeededRng("raid-board-b") });
    await claimCallsign(db, "raid-board-a", "RaiderA");
    await claimCallsign(db, "raid-board-b", "BunkerB");
    const [attacker] = await db.select().from(players).where(eq(players.authUserId, "raid-board-a"));
    const [defender] = await db.select().from(players).where(eq(players.authUserId, "raid-board-b"));

    await db.insert(battleReports).values({
      playerId: attacker!.id,
      actionKey: crypto.randomUUID(),
      kind: "PVP",
      defenderPlayerId: defender!.id,
      outcome: "ATTACKER_WIN",
      seed: "standing-test-seed",
      attackerCommitted: 4,
      defenderCommitted: 2,
      attackerCasualties: 0,
      defenderCasualties: 1,
      attackerPower: 40,
      defenderPower: 20,
      energyLooted: 24,
      metalLooted: 30,
      report: { public: true },
    });

    const standings = await loadWorldStandings(db, { viewerAuthUserId: "raid-board-a" });
    expect(standings.board[0]).toMatchObject({ callsign: "RaiderA", raidWins: 1, you: true });
    expect(standings.board[0]!.score).toBeGreaterThan(standings.board[1]!.score);
    expect(standings.intel).toHaveLength(1);
    expect(standings.intel[0]).toMatchObject({
      attacker: "RaiderA",
      defender: "BunkerB",
      outcome: "ATTACKER_WIN",
    });
    expect(standings.intel[0]).not.toHaveProperty("energyLooted");
    expect(standings.intel[0]).not.toHaveProperty("metalLooted");
    expect(standings.intel[0]).not.toHaveProperty("seed");
    await client.close();
  });
});
