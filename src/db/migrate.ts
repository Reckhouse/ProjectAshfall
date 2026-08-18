import "dotenv/config";
import { getDb } from "@/db/client";
import { seedActiveWorld, ACTIVE_WORLD_SLUG } from "@/db/seed";
import { getServerEnv } from "@/lib/env";

async function main(): Promise<void> {
  const env = getServerEnv();
  const db = await getDb();
  const result = await seedActiveWorld(db);
  console.info(
    JSON.stringify({
      event: "db.migrate.completed",
      driver: env.isPglite ? "pglite" : env.isNeon ? "neon" : "postgres",
      world: ACTIVE_WORLD_SLUG,
      worldId: result.worldId,
      regionId: result.regionId,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
