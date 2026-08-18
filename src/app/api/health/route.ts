import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jsonError, jsonOk } from "@/lib/http";
import { getServerEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getServerEnv();
    const db = await getDb();
    await db.execute(sql`select 1 as ok`);
    return jsonOk({
      status: "ok",
      driver: env.isPglite ? "pglite" : env.isNeon ? "neon" : "postgres",
    });
  } catch (error) {
    return jsonError(error, { commandType: "health" });
  }
}
