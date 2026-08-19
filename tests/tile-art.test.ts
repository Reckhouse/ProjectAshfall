import { describe, expect, it } from "vitest";
import {
  resolveTileArt,
  resolveTileFeature,
  TILE_ART,
  tileDetail,
} from "@/game/ui/tile-art";

describe("tile art mapping", () => {
  it("covers every terrain and overlay with a dedicated graphic", () => {
    expect(resolveTileArt({ type: "terrain", kind: "plains" })).toBe("plains");
    expect(resolveTileArt({ type: "terrain", kind: "ash" })).toBe("ash");
    expect(resolveTileArt({ type: "terrain", kind: "rock" })).toBe("rock");
    expect(resolveTileArt({ type: "terrain", kind: "ruin" })).toBe("ruin");
    expect(resolveTileArt({ type: "energy" })).toBe("energy");
    expect(resolveTileArt({ type: "metal" })).toBe("metal");
    expect(resolveTileArt({ type: "cave" })).toBe("cave");
    expect(resolveTileArt({ type: "base" })).toBe("base");
  });

  it("prefers bases, then nodes, then caves, then terrain", () => {
    expect(
      resolveTileFeature({
        ownBase: true,
        nodeType: "ENERGY",
        cave: true,
        terrain: "plains",
      }).type,
    ).toBe("base");
    expect(resolveTileFeature({ nodeType: "METAL", cave: true, terrain: "ash" }).type).toBe("metal");
    expect(resolveTileFeature({ cave: true, terrain: "ruin" }).type).toBe("cave");
    expect(resolveTileFeature({ terrain: "plains" })).toEqual({ type: "terrain", kind: "plains" });
    expect(resolveTileFeature({})).toEqual({ type: "terrain", kind: "ash" });
  });

  it("points each art id at a webp under /tiles", () => {
    for (const [id, meta] of Object.entries(TILE_ART)) {
      expect(meta.src).toBe(`/tiles/tile-${id}.webp`);
      expect(meta.alt.length).toBeGreaterThan(12);
      expect(meta.heading.length).toBeGreaterThan(2);
    }
  });

  it("formats coordinate captions", () => {
    expect(tileDetail(12, 40)).toBe("12, 40");
    expect(tileDetail(12, 40, "BASE")).toBe("12, 40 · BASE");
  });
});
