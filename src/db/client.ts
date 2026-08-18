import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { PGlite } from "@electric-sql/pglite";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@/db/schema";
import { PHASE1_MIGRATION_SQL } from "@/db/migrations/phase1";
import type { AppDb } from "@/db/types";
import { getServerEnv, pgliteDataDir } from "@/lib/env";
import { seedActiveWorld } from "@/db/seed";

neonConfig.webSocketConstructor = ws;

type GlobalDb = {
  db?: AppDb;
  pglite?: PGlite;
  pool?: Pool;
  ready?: Promise<AppDb>;
};

const globalForDb = globalThis as typeof globalThis & { __ashfallDb?: GlobalDb };

function getStore(): GlobalDb {
  if (!globalForDb.__ashfallDb) {
    globalForDb.__ashfallDb = {};
  }
  return globalForDb.__ashfallDb;
}

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !statement.startsWith("--"));
}

async function applyPhase1SchemaWithExec(execSql: (sql: string) => Promise<unknown>): Promise<void> {
  for (const statement of splitSqlStatements(PHASE1_MIGRATION_SQL)) {
    await execSql(statement);
  }
}

async function createPgliteDb(dataDir: string): Promise<AppDb> {
  const store = getStore();
  if (dataDir !== "memory://") {
    mkdirSync(path.dirname(path.resolve(dataDir)), { recursive: true });
  }

  const client = dataDir === "memory://" ? new PGlite() : new PGlite(dataDir);
  await client.waitReady;
  await client.exec(PHASE1_MIGRATION_SQL);
  const db = drizzlePglite(client, { schema }) as unknown as AppDb;
  store.pglite = client;
  store.db = db;
  await seedActiveWorld(db);
  return db;
}

async function createNeonDb(connectionString: string): Promise<AppDb> {
  const store = getStore();
  const pool = new Pool({ connectionString, max: 8 });
  await applyPhase1SchemaWithExec(async (sql) => {
    await pool.query(sql);
  });
  const db = drizzleNeon(pool, { schema }) as unknown as AppDb;
  store.pool = pool;
  store.db = db;
  await seedActiveWorld(db);
  return db;
}

export async function getDb(): Promise<AppDb> {
  const store = getStore();
  if (store.db) {
    return store.db;
  }
  if (!store.ready) {
    const env = getServerEnv();
    const duringBuild = process.env.NEXT_PHASE === "phase-production-build";
    store.ready =
      duringBuild || env.isPglite
        ? createPgliteDb(duringBuild ? "memory://" : pgliteDataDir(env.databaseUrl))
        : createNeonDb(env.databaseUrl);
  }
  return store.ready;
}

export async function createMemoryDb(): Promise<{ db: AppDb; client: PGlite }> {
  const client = new PGlite();
  await client.waitReady;
  await client.exec(PHASE1_MIGRATION_SQL);
  const db = drizzlePglite(client, { schema }) as unknown as AppDb;
  return { db, client };
}

export async function resetDbForTests(): Promise<void> {
  const store = getStore();
  if (store.pglite) {
    await store.pglite.close();
  }
  if (store.pool) {
    await store.pool.end();
  }
  globalForDb.__ashfallDb = {};
}
