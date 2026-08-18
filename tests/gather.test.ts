import { describe, expect, it } from "vitest";
import { pickGatherNode } from "@/game/world/nodes";

describe("pickGatherNode", () => {
  it("returns the closest remaining node within Chebyshev range", () => {
    const origin = { x: 10, y: 10 };
    const picked = pickGatherNode(
      [
        { id: "far", x: 12, y: 10, remaining: 18, resourceType: "METAL" },
        { id: "near", x: 11, y: 10, remaining: 30, resourceType: "ENERGY" },
        { id: "empty", x: 10, y: 11, remaining: 0, resourceType: "ENERGY" },
      ],
      origin,
      1,
    );
    expect(picked?.id).toBe("near");
  });

  it("returns null when nothing is in range", () => {
    expect(
      pickGatherNode(
        [{ id: "far", x: 14, y: 10, remaining: 30, resourceType: "ENERGY" }],
        { x: 10, y: 10 },
        1,
      ),
    ).toBeNull();
  });
});
