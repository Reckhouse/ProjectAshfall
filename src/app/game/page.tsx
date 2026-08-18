import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { GameShell } from "@/components/game/GameShell";
import { getCurrentAuthUser } from "@/lib/auth/session";
import { chunkCoord } from "@/game/world/chunks";
import { getVisibleChunks } from "@/game/services/chunks";
import { ensurePlayerProvisioned } from "@/game/services/provision";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GamePage() {
  const db = await getDb();
  const user = await getCurrentAuthUser(db);
  if (!user) {
    redirect("/login");
  }

  const player = await ensurePlayerProvisioned(db, user.id);
  const initialView = player.location
    ? await getVisibleChunks(db, user.id, {
        chunkX: chunkCoord(player.location.x),
        chunkY: chunkCoord(player.location.y),
        radius: 1,
      })
    : null;
  return <GameShell player={player} initialView={initialView} />;
}
