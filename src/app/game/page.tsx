import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { GameShell } from "@/components/game/GameShell";
import { getCurrentAuthUser } from "@/lib/auth/session";
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
  return <GameShell player={player} />;
}
