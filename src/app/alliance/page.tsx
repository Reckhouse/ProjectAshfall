import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { AllianceDesk } from "@/components/game/AllianceDesk";
import { loadAllianceDesk } from "@/game/services/alliances";
import { getCurrentAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AlliancePage() {
  const db = await getDb();
  const user = await getCurrentAuthUser(db);
  if (!user) {
    redirect("/login");
  }

  const desk = await loadAllianceDesk(db, user.id);
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ash-border)] pb-4">
        <div>
          <p className="ash-label">Social</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--ash-beige)]">Alliance</h1>
        </div>
        <Link
          href="/game"
          className="min-h-11 border border-[var(--ash-border)] px-4 py-2 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)]"
        >
          Command shell
        </Link>
      </header>
      <p className="mt-4 max-w-2xl text-sm text-[var(--ash-muted)]">
        Found or join a tagged company. Membership is server-owned. Allied bunkers cannot raid each other.
      </p>
      <div className="mt-6">
        <AllianceDesk initial={desk} />
      </div>
    </main>
  );
}
