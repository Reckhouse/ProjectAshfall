import { getDb } from "@/db/client";
import { getCurrentAuthUser } from "@/lib/auth/session";
import { LandingActions } from "@/components/auth/LandingActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const db = await getDb();
  const user = await getCurrentAuthUser(db);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="ash-label">Persistent grid command</p>
      <h1 className="mt-3 text-5xl font-semibold tracking-tight text-[var(--ash-beige)]">
        PROJECT ASHFALL
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--ash-muted)]">
        Command a vulnerable base in a shared industrial wasteland. Phase 1 establishes your
        account and plants one server-chosen outpost in Ashfall-01.
      </p>
      <LandingActions authenticated={Boolean(user)} />
    </main>
  );
}
