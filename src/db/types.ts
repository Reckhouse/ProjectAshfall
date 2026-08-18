import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

export type AppSchema = typeof schema;

export type AppDb = PgDatabase<PgQueryResultHKT, AppSchema, ExtractTablesWithRelations<AppSchema>>;

export type AppTx = PgTransaction<PgQueryResultHKT, AppSchema, ExtractTablesWithRelations<AppSchema>>;

export type DbExecutor = AppDb | AppTx;
