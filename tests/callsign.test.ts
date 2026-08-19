import { describe, expect, it } from "vitest";
import { players } from "@/db/schema";
import { eq } from "drizzle-orm";
import { claimCallsign } from "@/game/services/callsign";
import { ensurePlayerProvisioned } from "@/game/services/provision";
import { parseCallsign } from "@/lib/validation/callsign";
import { createSeededRng } from "@/game/world/rng";
import { setupIsolatedGameDb } from "./helpers/db";

describe("callsigns", () => {
  it("rejects reserved and malformed names", () => {
    expect(() => parseCallsign("ab")).toThrow();
    expect(() => parseCallsign("1bad")).toThrow();
    expect(() => parseCallsign("admin")).toThrow();
    expect(parseCallsign("Ash_01")).toBe("Ash_01");
  });

  it("claims a unique callsign once per commander", async () => {
    const { db, client } = await setupIsolatedGameDb();
    await ensurePlayerProvisioned(db, "name-user", { rng: createSeededRng("name-user") });
    const first = await claimCallsign(db, "name-user", "Cinder");
    expect(first.displayName).toBe("Cinder");
    const snapshot = await ensurePlayerProvisioned(db, "name-user");
    expect(snapshot.displayName).toBe("Cinder");
    expect(snapshot.kind).toBe("HUMAN");
    await expect(claimCallsign(db, "name-user", "OtherName")).rejects.toMatchObject({ code: "INVALID_COMMAND" });

    await ensurePlayerProvisioned(db, "name-user-2", { rng: createSeededRng("name-user-2") });
    await expect(claimCallsign(db, "name-user-2", "cinder")).rejects.toMatchObject({ code: "CALLSIGN_TAKEN" });
    const [row] = await db.select().from(players).where(eq(players.authUserId, "name-user"));
    expect(row?.displayName).toBe("Cinder");
    await client.close();
  });
});
