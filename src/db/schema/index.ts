import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
};

export const authUsers = pgTable("auth_users", {
  id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const worlds = pgTable(
  "worlds",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    seed: text("seed").notNull(),
    generationVersion: integer("generation_version").notNull(),
    balanceVersion: integer("balance_version").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("worlds_status_check", sql`${table.status} in ('DRAFT', 'ACTIVE', 'CLOSED')`),
    check("worlds_dims_check", sql`${table.width} > 0 and ${table.height} > 0`),
  ],
);

export const worldRegions = pgTable(
  "world_regions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    minX: integer("min_x").notNull(),
    maxX: integer("max_x").notNull(),
    minY: integer("min_y").notNull(),
    maxY: integer("max_y").notNull(),
    spawnEnabled: boolean("spawn_enabled").notNull().default(false),
    spawnWeight: integer("spawn_weight").notNull().default(1),
    softPlayerCap: integer("soft_player_cap"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("world_regions_bounds_check", sql`${table.minX} <= ${table.maxX} and ${table.minY} <= ${table.maxY}`),
    unique("world_regions_unique_bounds").on(table.worldId, table.minX, table.minY, table.maxX, table.maxY),
  ],
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    authUserId: text("auth_user_id").notNull().unique(),
    status: text("status").notNull(),
    worldId: uuid("world_id").references(() => worlds.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    version: integer("version").notNull().default(1),
    locationType: text("location_type").notNull().default("BASE"),
    x: integer("x"),
    y: integer("y"),
    lastMoveAt: timestamp("last_move_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    check("players_status_check", sql`${table.status} in ('PROVISIONING', 'ACTIVE', 'SUSPENDED')`),
    check("players_location_type_check", sql`${table.locationType} in ('BASE', 'FIELD')`),
    index("players_world_coord_idx").on(table.worldId, table.x, table.y),
  ],
);

export const bases = pgTable(
  "bases",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    playerId: uuid("player_id")
      .notNull()
      .unique()
      .references(() => players.id),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    level: integer("level").notNull().default(1),
    storageLevel: integer("storage_level").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    unique("bases_world_coord_unique").on(table.worldId, table.x, table.y),
    check("bases_storage_level_check", sql`${table.storageLevel} >= 1`),
    index("bases_world_x_idx").on(table.worldId, table.x),
    index("bases_world_y_idx").on(table.worldId, table.y),
  ],
);

export const playerResources = pgTable(
  "player_resources",
  {
    playerId: uuid("player_id")
      .primaryKey()
      .references(() => players.id),
    energy: bigint("energy", { mode: "number" }).notNull(),
    metal: bigint("metal", { mode: "number" }).notNull(),
    energyAccruedAt: timestamp("energy_accrued_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    metalAccruedAt: timestamp("metal_accrued_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check("player_resources_energy_nonneg", sql`${table.energy} >= 0`),
    check("player_resources_metal_nonneg", sql`${table.metal} >= 0`),
  ],
);

export const worldFeatures = pgTable(
  "world_features",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    chunkX: integer("chunk_x").notNull(),
    chunkY: integer("chunk_y").notNull(),
    featureType: text("feature_type").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    generationVersion: integer("generation_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("world_features_type_check", sql`${table.featureType} in ('ENERGY_NODE', 'METAL_NODE', 'CAVE')`),
    unique("world_features_unique_tile").on(table.worldId, table.x, table.y),
    index("world_features_world_chunk_idx").on(table.worldId, table.chunkX, table.chunkY),
  ],
);

export const resourceNodes = pgTable(
  "resource_nodes",
  {
    featureId: uuid("feature_id")
      .primaryKey()
      .references(() => worldFeatures.id, { onDelete: "cascade" }),
    resourceType: text("resource_type").notNull(),
    capacity: integer("capacity").notNull(),
    remaining: integer("remaining").notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("resource_nodes_type_check", sql`${table.resourceType} in ('ENERGY', 'METAL')`),
    check("resource_nodes_remaining_check", sql`${table.remaining} >= 0 and ${table.remaining} <= ${table.capacity}`),
  ],
);

export const caves = pgTable("caves", {
  featureId: uuid("feature_id")
    .primaryKey()
    .references(() => worldFeatures.id, { onDelete: "cascade" }),
  tier: integer("tier").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const caveClears = pgTable(
  "cave_clears",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    caveId: uuid("cave_id")
      .notNull()
      .references(() => caves.featureId, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    rewardVersion: integer("reward_version").notNull(),
    toolId: uuid("tool_id"),
    clearedAt: timestamp("cleared_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [unique("cave_clears_player_cave_unique").on(table.playerId, table.caveId)],
);

export const toolInstances = pgTable(
  "tool_instances",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    ownerPlayerId: uuid("owner_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    resourceAffinity: text("resource_affinity").notNull(),
    tier: integer("tier").notNull(),
    collectionBonusBps: integer("collection_bonus_bps").notNull(),
    equippedSlot: text("equipped_slot"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("tool_instances_affinity_check", sql`${table.resourceAffinity} in ('ENERGY', 'METAL')`),
    check("tool_instances_slot_check", sql`${table.equippedSlot} is null or ${table.equippedSlot} in ('ENERGY', 'METAL')`),
    uniqueIndex("tool_instances_equipped_slot_unique")
      .on(table.ownerPlayerId, table.equippedSlot)
      .where(sql`${table.equippedSlot} is not null`),
    index("tool_instances_owner_idx").on(table.ownerPlayerId),
  ],
);

export const gameActions = pgTable(
  "game_actions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id),
    actionKey: text("action_key").notNull(),
    actionType: text("action_type").notNull(),
    requestHash: text("request_hash"),
    status: text("status").notNull(),
    resultCode: text("result_code"),
    resultPayload: jsonb("result_payload"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    unique("game_actions_player_key_unique").on(table.playerId, table.actionKey),
    check("game_actions_status_check", sql`${table.status} in ('STARTED', 'COMPLETED', 'FAILED')`),
  ],
);

export const expeditions = pgTable(
  "expeditions",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    worldId: uuid("world_id")
      .notNull()
      .references(() => worlds.id),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    returnedAt: timestamp("returned_at", { withTimezone: true, mode: "date" }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
    version: integer("version").notNull().default(1),
  },
  (table) => [
    check("expeditions_status_check", sql`${table.status} in ('ACTIVE', 'RETURNED')`),
    uniqueIndex("expeditions_one_active").on(table.playerId).where(sql`${table.status} = 'ACTIVE'`),
    index("expeditions_player_idx").on(table.playerId),
  ],
);

export const troopStacks = pgTable(
  "troop_stacks",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    locationType: text("location_type").notNull(),
    locationId: uuid("location_id").notNull(),
    unitType: text("unit_type").notNull(),
    quantity: integer("quantity").notNull(),
    wounded: integer("wounded").notNull().default(0),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check("troop_stacks_type_check", sql`${table.unitType} in ('DEFENSE', 'OFFENSE')`),
    check("troop_stacks_location_check", sql`${table.locationType} in ('BASE', 'EXPEDITION')`),
    check("troop_stacks_qty_check", sql`${table.quantity} >= 0 and ${table.wounded} >= 0 and ${table.wounded} <= ${table.quantity}`),
    check("troop_stacks_defense_home_check", sql`${table.unitType} <> 'DEFENSE' or ${table.locationType} = 'BASE'`),
    unique("troop_stacks_assignment_unique").on(table.playerId, table.locationType, table.locationId, table.unitType),
    index("troop_stacks_player_idx").on(table.playerId),
  ],
);

export const battleReports = pgTable(
  "battle_reports",
  {
    id: uuid("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    actionKey: text("action_key").notNull(),
    kind: text("kind").notNull(),
    caveId: uuid("cave_id").references(() => caves.featureId, { onDelete: "set null" }),
    defenderPlayerId: uuid("defender_player_id").references(() => players.id, { onDelete: "set null" }),
    outcome: text("outcome").notNull(),
    seed: text("seed").notNull(),
    attackerCommitted: integer("attacker_committed").notNull(),
    defenderCommitted: integer("defender_committed").notNull(),
    attackerCasualties: integer("attacker_casualties").notNull(),
    defenderCasualties: integer("defender_casualties").notNull(),
    attackerPower: integer("attacker_power").notNull(),
    defenderPower: integer("defender_power").notNull(),
    energyLooted: integer("energy_looted").notNull().default(0),
    metalLooted: integer("metal_looted").notNull().default(0),
    report: jsonb("report").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    unique("battle_reports_player_action_unique").on(table.playerId, table.actionKey),
    check("battle_reports_kind_check", sql`${table.kind} in ('CAVE', 'PVP')`),
    check("battle_reports_outcome_check", sql`${table.outcome} in ('ATTACKER_WIN', 'DEFENDER_WIN')`),
    check(
      "battle_reports_qty_check",
      sql`${table.attackerCommitted} >= 0 and ${table.defenderCommitted} >= 0
        and ${table.attackerCasualties} >= 0 and ${table.attackerCasualties} <= ${table.attackerCommitted}
        and ${table.defenderCasualties} >= 0 and ${table.defenderCasualties} <= ${table.defenderCommitted}
        and ${table.energyLooted} >= 0 and ${table.metalLooted} >= 0`,
    ),
    index("battle_reports_player_idx").on(table.playerId),
  ],
);

export const raidCooldowns = pgTable(
  "raid_cooldowns",
  {
    attackerPlayerId: uuid("attacker_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    defenderPlayerId: uuid("defender_player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    lastRaidAt: timestamp("last_raid_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    unique("raid_cooldowns_pair_unique").on(table.attackerPlayerId, table.defenderPlayerId),
    index("raid_cooldowns_defender_idx").on(table.defenderPlayerId),
  ],
);
