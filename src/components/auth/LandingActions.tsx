import Link from "next/link";

export function LandingActions({ authenticated }: { authenticated: boolean }) {
  if (authenticated) {
    return (
      <div className="mt-10 flex flex-wrap gap-4">
        <Link
          href="/game"
          className="inline-flex min-h-12 items-center justify-center border border-[var(--ash-rust)] bg-[var(--ash-rust)] px-5 font-medium text-black"
        >
          Enter base
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-wrap gap-4">
      <Link
        href="/register"
        className="inline-flex min-h-12 items-center justify-center border border-[var(--ash-rust)] bg-[var(--ash-rust)] px-5 font-medium text-black"
      >
        Create account
      </Link>
      <Link
        href="/login"
        className="inline-flex min-h-12 items-center justify-center border border-[var(--ash-border)] px-5 font-medium text-[var(--ash-beige)]"
      >
        Log in
      </Link>
    </div>
  );
}
