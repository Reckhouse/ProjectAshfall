"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="min-h-11 border border-[var(--ash-border)] px-4 text-sm uppercase tracking-[0.14em] text-[var(--ash-beige)] disabled:opacity-60"
    >
      {pending ? "Closing session..." : "Log out"}
    </button>
  );
}
