export type PlayerStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED";
export type WorldStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type GameActionStatus = "STARTED" | "COMPLETED" | "FAILED";

export type WorldView = {
  id: string;
  slug: string;
  seed: string;
  generationVersion: number;
  width: number;
  height: number;
};

export type SpawnRegion = {
  id: string;
  worldId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  spawnEnabled: boolean;
  spawnWeight: number;
};

export type LocationType = "BASE" | "FIELD";
export type Direction = "north" | "south" | "east" | "west";
export type TerrainKind = "plains" | "ash" | "rock" | "ruin";

export type PlayerSnapshot = {
  status: PlayerStatus;
  world: string | null;
  base: {
    x: number;
    y: number;
    status: "ESTABLISHED" | "PENDING";
    level: number;
  } | null;
  resources: {
    energy: number;
    metal: number;
  } | null;
  location: {
    type: LocationType;
    x: number;
    y: number;
  } | null;
};

export type Rng = {
  nextFloat(): number;
  nextInt(minInclusive: number, maxExclusive: number): number;
};
