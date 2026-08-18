import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getCurrentAuthUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const db = await getDb();
  const user = await getCurrentAuthUser(db);
  if (user) {
    redirect("/game");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <Link href="/" className="ash-label no-underline">
        Project Ashfall
      </Link>
      <div className="ash-frame mt-6 p-6 sm:p-8">{children}</div>
    </main>
  );
}
