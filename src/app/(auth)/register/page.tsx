import { RegisterForm } from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold text-[var(--ash-beige)]">Create account</h1>
      <p className="mt-2 text-sm text-[var(--ash-muted)]">
        The server will assign your base. Pick a callsign so other commanders can tell whose bunker is whose.
      </p>
      <RegisterForm />
    </>
  );
}
