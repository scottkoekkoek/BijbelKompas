"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function ResetForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} noValidate>
      <div aria-live="polite">
        {state?.error && <p className="alert error" role="alert">{state.error}</p>}
        {state?.ok && <p className="alert ok">{state.ok}</p>}
      </div>
      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <SubmitButton pendingText="Bezig met versturen…">Stuur herstellink</SubmitButton>
      <p>
        <Link href="/login">Terug naar inloggen</Link>
      </p>
    </form>
  );
}
