import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold text-[var(--ash-beige)]">Log in</h1>
      <p className="mt-2 text-sm text-[var(--ash-muted)]">Return to your established base.</p>
      <LoginForm />
    </>
  );
}
