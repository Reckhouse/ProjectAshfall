"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      const body = (await response.json()) as { ok?: boolean; message?: string };
      if (!response.ok || body.ok !== true) {
        setError(body.message ?? "Invalid email or password.");
        return;
      }
      router.push("/game");
      router.refresh();
    } catch {
      setError("Invalid email or password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
      <div>
        <label className="ash-label block" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 min-h-11 w-full border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
        />
      </div>
      <div>
        <label className="ash-label block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 min-h-11 w-full border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--ash-danger)]">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full border border-[var(--ash-olive)] bg-[var(--ash-olive)] font-medium text-black disabled:opacity-60"
      >
        {pending ? "Checking credentials..." : "Log in"}
      </button>
      <p className="text-sm text-[var(--ash-muted)]">
        No command yet?{" "}
        <Link href="/register" className="underline">
          Create account
        </Link>
      </p>
    </form>
  );
}
