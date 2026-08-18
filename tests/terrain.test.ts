import { describe, expect, it } from "vitest";
import { createSeededRng } from "@/game/world/rng";
import { isInWorldBounds, isPassable, isReserved, isValidBaseTile } from "@/game/world/terrain";
import type { WorldView } from "@/game/domain/types";

const world: WorldView = {
  id: "world-1",
  slug: "ashfall-01",
  seed: "test-world-seed-v1",
  generationVersion: 1,
  width: 64,
  height: 64,
};

describe("terrain validity", () => {
  it("rejects out-of-bounds tiles", () => {
    expect(isInWorldBounds(world, -1, 0)).toBe(false);
    expect(isInWorldBounds(world, 0, -1)).toBe(false);
    expect(isInWorldBounds(world, 64, 0)).toBe(false);
    expect(isInWorldBounds(world, 0, 64)).toBe(false);
    expect(isPassable(world, -1, 0)).toBe(false);
    expect(isPassable(world, 64, 10)).toBe(false);
  });

  it("accepts in-bounds coordinates", () => {
    expect(isInWorldBounds(world, 0, 0)).toBe(true);
    expect(isInWorldBounds(world, 63, 63)).toBe(true);
  });

  it("is deterministic for the same seed and generation version", () => {
    const a = isPassable(world, 12, 19);
    const b = isPassable({ ...world }, 12, 19);
    expect(a).toBe(b);
  });

  it("can change with generation version", () => {
    const v1 = isPassable(world, 7, 9);
    const v2 = isPassable({ ...world, generationVersion: 2 }, 7, 9);
    expect(typeof v1).toBe("boolean");
    expect(typeof v2).toBe("boolean");
  });

  it("does not reserve tiles in Phase 1", () => {
    expect(isReserved(world, 10, 10)).toBe(false);
    expect(isValidBaseTile(world, 10, 10)).toBe(isPassable(world, 10, 10));
  });

  it("seeded RNG is reproducible", () => {
    const first = createSeededRng("spawn-seed");
    const second = createSeededRng("spawn-seed");
    expect([first.nextInt(0, 100), first.nextInt(0, 100)]).toEqual([
      second.nextInt(0, 100),
      second.nextInt(0, 100),
    ]);
  });
});
