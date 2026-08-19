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
export type ResourceKind = "ENERGY" | "METAL";
export type FeatureType = "ENERGY_NODE" | "METAL_NODE" | "CAVE";
export type ToolSlot = "ENERGY" | "METAL";
export type TroopType = "DEFENSE" | "OFFENSE";
export type TroopLocationType = "BASE" | "EXPEDITION";
export type ExpeditionStatus = "ACTIVE" | "RETURNED";

export type EquippedTool = {
  tier: number;
  bonusBps: number;
};

export type PlayerSnapshot = {
  status: PlayerStatus;
  world: string | null;
  base: {
    x: number;
    y: number;
    status: "ESTABLISHED" | "PENDING";
    level: number;
    storageLevel: number;
  } | null;
  resources: {
    energy: number;
    metal: number;
    energyCap: number;
    metalCap: number;
    energyPerHour: number;
    metalPerHour: number;
  } | null;
  location: {
    type: LocationType;
    x: number;
    y: number;
  } | null;
  tools: {
    energy: EquippedTool | null;
    metal: EquippedTool | null;
  };
  troops: {
    defense: { atBase: number; deployed: number };
    offense: { atBase: number; deployed: number };
  };
  expedition: {
    id: string;
    offense: number;
    power: number;
  } | null;
};

export type Rng = {
  nextFloat(): number;
  nextInt(minInclusive: number, maxExclusive: number): number;
};
