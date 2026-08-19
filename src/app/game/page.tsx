import { after } from "next/server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { GameShell } from "@/components/game/GameShell";
import { isAdminEmail } from "@/lib/auth/admin";
import { getCurrentAuthUser } from "@/lib/auth/session";
import { chunkCoord } from "@/game/world/chunks";
import { getVisibleChunks } from "@/game/services/chunks";
import { maybeTickBotsInBackground } from "@/game/services/bots";
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
  after(() => {
    void maybeTickBotsInBackground(db).catch(() => undefined);
  });
  return <GameShell player={player} initialView={initialView} isAdmin={isAdminEmail(user.email)} />;
}
