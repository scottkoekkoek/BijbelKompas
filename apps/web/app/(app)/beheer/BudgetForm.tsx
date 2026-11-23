"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { setAiBudget, type BudgetState } from "./actions";

/** Ronde 3 §6: monthly AI limits for the pilot. New AI work stops at 90% of either limit. */
export function BudgetForm({ userLimit, pilotLimit }: { userLimit: number; pilotLimit: number }) {
  const [state, action] = useActionState<BudgetState, FormData>(setAiBudget, undefined);
  return (
    <form action={action} className="budget-form">
      <div className="field">
        <label htmlFor="budget-user">Per account per maand (euro)</label>
        <input id="budget-user" name="user" type="number" inputMode="decimal" min={0} max={100} step="0.5" defaultValue={userLimit} required />
      </div>
      <div className="field">
        <label htmlFor="budget-pilot">Hele pilot samen per maand (euro)</label>
        <input id="budget-pilot" name="pilot" type="number" inputMode="decimal" min={0} max={1000} step="1" defaultValue={pilotLimit} required />
      </div>
      <SubmitButton pendingText="Bezig met opslaan…">Budget opslaan</SubmitButton>
      <p aria-live="polite">
        {state?.ok && <span className="alert ok" style={{ display: "inline-block" }}>Opgeslagen</span>}
        {state?.error && <span className="alert error" role="alert" style={{ display: "inline-block" }}>{state.error}</span>}
      </p>
    </form>
  );
}
