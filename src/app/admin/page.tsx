import { redirect } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/db/client";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { loadAdminStats } from "@/game/services/admin-stats";
import { isAdminUser } from "@/lib/auth/admin";
import { getCurrentAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const db = await getDb();
  const user = await getCurrentAuthUser(db);
  if (!user) {
    redirect("/login");
  }
  if (!isAdminUser(user)) {
    redirect("/game");
  }

  const stats = await loadAdminStats(db);
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--ash-border)] pb-4">
        <div>
          <p className="ash-label">Restricted</p>
          <h1 className="mt-2 text-3xl font-semibold text-[var(--ash-beige)]">Admin panel</h1>
        </div>
        <Link
          href="/game"
          className="min-h-11 border border-[var(--ash-border)] px-4 py-2 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)]"
        >
          Command shell
        </Link>
      </header>
      <div className="mt-6">
        <AdminPanel initialStats={stats} />
      </div>
    </main>
  );
}
