"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { redeemLink } from "../actions";

export function RedeemForm({ token, recovery }: { token: string; recovery: boolean }) {
  const [state, action] = useActionState(redeemLink, undefined);
  return (
    <form action={action} noValidate>
      <input type="hidden" name="token" value={token} />
      <div aria-live="polite">{state?.error && <p className="alert error" role="alert">{state.error}</p>}</div>
      <div className="field">
        <label htmlFor="email">E-mailadres</label>
        <input id="email" name="email" type="email" autoComplete="email" required aria-describedby="email-hint" />
        <span id="email-hint" className="hint">Het adres waarop je deze link kreeg.</span>
      </div>
      {!recovery && (
        <div className="field">
          <label htmlFor="name">Naam (optioneel)</label>
          <input id="name" name="name" type="text" autoComplete="given-name" maxLength={100} />
        </div>
      )}
      <div className="field">
        <label htmlFor="password">{recovery ? "Nieuw wachtwoord" : "Kies een wachtwoord"}</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pw-hint" />
        <span id="pw-hint" className="hint">Minstens 12 tekens, met een hoofdletter, een kleine letter en een cijfer.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Herhaal wachtwoord</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <p className="hint">
        Je gegevens blijven in je eigen account. AI-hulp staat uit tot je die zelf aanzet; dan gaat alleen de tekst die je daarvoor kiest naar de
        AI-aanbieder.
      </p>
      <SubmitButton pendingText="Bezig…">{recovery ? "Wachtwoord opslaan" : "Account aanmaken"}</SubmitButton>
    </form>
  );
}
