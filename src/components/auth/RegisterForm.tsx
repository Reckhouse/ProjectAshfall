"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiError = { ok: false; message?: string };

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
      callsign: String(form.get("callsign") ?? ""),
    };

    try {
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const registerBody = (await registerResponse.json()) as ApiError | { ok: true };
      if (!registerResponse.ok || !("ok" in registerBody) || registerBody.ok !== true) {
        setError("message" in registerBody ? registerBody.message ?? "Unable to create that account." : "Unable to create that account.");
        return;
      }

      const provisionResponse = await fetch("/api/game/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: crypto.randomUUID() }),
      });
      if (!provisionResponse.ok) {
        setError("Account created. Base provisioning is retrying from the command shell.");
      }
      router.push("/game");
      router.refresh();
    } catch {
      setError("Unable to create that account.");
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
        <label className="ash-label block" htmlFor="callsign">
          Callsign
        </label>
        <input
          id="callsign"
          name="callsign"
          type="text"
          autoComplete="username"
          minLength={3}
          maxLength={16}
          pattern="[A-Za-z][A-Za-z0-9_]{2,15}"
          required
          className="mt-2 min-h-11 w-full border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
        />
        <p className="mt-1 text-xs text-[var(--ash-muted)]">3–16 characters. Shown on your base.</p>
      </div>
      <div>
        <label className="ash-label block" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-2 min-h-11 w-full border border-[var(--ash-border)] bg-black/30 px-3 text-[var(--ash-text)]"
        />
      </div>
      <div>
        <label className="ash-label block" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
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
        className="min-h-12 w-full border border-[var(--ash-rust)] bg-[var(--ash-rust)] font-medium text-black disabled:opacity-60"
      >
        {pending ? "Establishing command..." : "Create account"}
      </button>
      <p className="text-sm text-[var(--ash-muted)]">
        Already posted?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
