"use client";
import { useActionState } from "react";
import { setNewPassword } from "@/app/auth/actions";
import { SubmitButton } from "@/components/SubmitButton";

export function NewPasswordForm() {
  const [state, action] = useActionState(setNewPassword, undefined);
  return (
    <form action={action} noValidate>
      <div aria-live="polite">{state?.error && <p className="alert error" role="alert">{state.error}</p>}</div>
      <div className="field">
        <label htmlFor="password">Nieuw wachtwoord</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pw-hint" />
        <span id="pw-hint" className="hint">Minstens 12 tekens, met een hoofdletter, een kleine letter en een cijfer.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Herhaal wachtwoord</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <SubmitButton pendingText="Bezig met opslaan…">Wachtwoord opslaan</SubmitButton>
    </form>
  );
}
