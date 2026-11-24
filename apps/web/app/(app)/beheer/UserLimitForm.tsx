"use client";
import { useActionState, useId } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { setUserAiLimit, type BudgetState } from "./actions";

/**
 * Ronde 4 (ADR-020): an own AI limit for one account. Empty = the default for every account.
 * Only the limit is shown, never what someone used: usage stays private, as in Ronde 3.
 */
export function UserLimitForm({ userId, email, limit, defaultLimit }: { userId: string; email: string; limit: number | null; defaultLimit: number }) {
  const [state, action] = useActionState<BudgetState, FormData>(setUserAiLimit, undefined);
  const id = useId();
  return (
    <form action={action} className="user-limit-form">
      <input type="hidden" name="user" value={userId} />
      <label htmlFor={id} className="visually-hidden">AI-limiet per maand voor {email} (euro)</label>
      <span aria-hidden="true" className="muted">AI € </span>
      <input
        id={id}
        name="limit"
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step="0.5"
        defaultValue={limit ?? ""}
        placeholder={`${defaultLimit} (standaard)`}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className="visually-hidden">Leeg laten voor de standaardlimiet.</span>
      <SubmitButton className="button small secondary" pendingText="Opslaan…">Limiet opslaan</SubmitButton>
      <span aria-live="polite">
        {state?.ok && <span className="badge afgerond">Opgeslagen</span>}
        {state?.error && <span className="alert error" role="alert">{state.error}</span>}
      </span>
    </form>
  );
}
