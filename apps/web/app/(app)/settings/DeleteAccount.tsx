"use client";
/**
 * Ronde 4 (V10): delete your own account. Two steps: first open the form (with a pointer to the
 * export), then your password and the word VERWIJDEREN. Afterwards the login page wipes this
 * browser's offline copy too, so nothing of the account is left on this device.
 */
import { useActionState, useId, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { TrashIcon } from "@/components/icons";
import { deleteOwnAccount, type DeleteState } from "./account-actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<DeleteState, FormData>(deleteOwnAccount, undefined);
  const id = useId();

  if (!open) {
    return (
      <button type="button" className="button secondary danger-text" onClick={() => setOpen(true)}>
        <TrashIcon />
        Account verwijderen…
      </button>
    );
  }
  return (
    <form action={action} className="delete-account" aria-labelledby={`${id}-t`}>
      <h3 id={`${id}-t`}>Weet je het zeker?</h3>
      <p>
        Al je notities, versies, koppelingen, collecties, vragen, sjablonen, gelezen verzen en voorkeuren worden direct gewist. Dat kan niet
        ongedaan worden gemaakt. Ook wijzigingen op dit apparaat die nog niet verstuurd zijn, gaan verloren.
      </p>
      <p>
        <a href="/api/v1/export" download>Download eerst een export</a> als je iets wilt bewaren.
      </p>
      <div className="field">
        <label htmlFor={`${id}-pw`}>Je wachtwoord</label>
        <input id={`${id}-pw`} name="password" type="password" autoComplete="current-password" required />
      </div>
      <div className="field">
        <label htmlFor={`${id}-c`}>Typ VERWIJDEREN</label>
        <input id={`${id}-c`} name="confirm" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
      </div>
      <div aria-live="polite">{state?.error && <p className="alert error" role="alert">{state.error}</p>}</div>
      <div className="button-row">
        <SubmitButton className="button danger" pendingText="Verwijderen…">Account definitief verwijderen</SubmitButton>
        <button type="button" className="button secondary" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
    </form>
  );
}
