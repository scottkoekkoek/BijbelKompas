"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function LoginForm({ next, linkError }: { next?: string; linkError: boolean }) {
  const [state, action] = useActionState(signIn, undefined);
  const error = state?.error ?? (linkError ? "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan." : undefined);
  return (
    <form action={action} noValidate>
      <div aria-live="polite">{error && <p className="alert error" role="alert">{error}</p>}</div>
      {next && <input type="hidden" name="next" value={next} />}
      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Wachtwoord</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton pendingText="Bezig met inloggen…">Inloggen</SubmitButton>
      <p>
        <Link href="/wachtwoord-vergeten">Wachtwoord vergeten?</Link>
      </p>
    </form>
  );
}
