import type { LocationType, ResourceKind, TerrainKind } from "@/game/domain/types";

export type TileArtId =
  | "plains"
  | "ash"
  | "rock"
  | "ruin"
  | "energy"
  | "metal"
  | "cave"
  | "base";

export type TileFeature =
  | { type: "base" }
  | { type: "energy" }
  | { type: "metal" }
  | { type: "cave" }
  | { type: "terrain"; kind: TerrainKind };

export const TILE_ART: Record<
  TileArtId,
  { src: string; alt: string; heading: string }
> = {
  plains: {
    src: "/tiles/tile-plains.webp",
    alt: "Dry olive grassland stretching toward a hazy ash horizon",
    heading: "Plains",
  },
  ash: {
    src: "/tiles/tile-ash.webp",
    alt: "Grey ash flats with cracked earth and faint dust haze",
    heading: "Ash flats",
  },
  rock: {
    src: "/tiles/tile-rock.webp",
    alt: "Blocked volcanic rock and jagged basalt ridges",
    heading: "Rock",
  },
  ruin: {
    src: "/tiles/tile-ruin.webp",
    alt: "Collapsed industrial wreckage on scorched ground",
    heading: "Ruin",
  },
  energy: {
    src: "/tiles/tile-energy.webp",
    alt: "Amber energy vent glowing from a cracked industrial well",
    heading: "Energy vent",
  },
  metal: {
    src: "/tiles/tile-metal.webp",
    alt: "Pile of salvageable scrap metal on dusty ground",
    heading: "Scrap metal",
  },
  cave: {
    src: "/tiles/tile-cave.webp",
    alt: "Dark cave mouth cut into a rocky hillside",
    heading: "Cave",
  },
  base: {
    src: "/tiles/tile-base.webp",
    alt: "Bunker outpost with rusted plating and a faded olive hatch",
    heading: "Bunker",
  },
};

export function resolveTileArt(feature: TileFeature): TileArtId {
  switch (feature.type) {
    case "base":
      return "base";
    case "energy":
      return "energy";
    case "metal":
      return "metal";
    case "cave":
      return "cave";
    case "terrain":
      return feature.kind;
  }
}

export function resolveTileFeature(input: {
  ownBase?: boolean;
  otherBase?: boolean;
  nodeType?: ResourceKind | null;
  cave?: boolean;
  terrain?: TerrainKind | null;
}): TileFeature {
  if (input.ownBase || input.otherBase) {
    return { type: "base" };
  }
  if (input.nodeType === "ENERGY") {
    return { type: "energy" };
  }
  if (input.nodeType === "METAL") {
    return { type: "metal" };
  }
  if (input.cave) {
    return { type: "cave" };
  }
  return { type: "terrain", kind: input.terrain ?? "ash" };
}

export function tileDetail(x: number, y: number, locationType?: LocationType | null): string {
  const suffix = locationType ? ` · ${locationType}` : "";
  return `${x}, ${y}${suffix}`;
}
