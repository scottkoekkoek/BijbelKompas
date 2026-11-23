"use client";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { createLink, type LinkState } from "./actions";

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="button secondary small"
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => setDone(true))
          .catch(() => setDone(false))
      }
    >
      {done ? "Gekopieerd" : label}
    </button>
  );
}

/** Makes an invitation (or, with kind "herstel", a recovery link) and shows it once. */
export function LinkForm({ kind = "uitnodiging", email = "", compact = false }: { kind?: "uitnodiging" | "herstel"; email?: string; compact?: boolean }) {
  const [state, action] = useActionState<LinkState, FormData>(createLink, undefined);
  const id = kind === "herstel" ? `herstel-${email}` : "uitnodiging";
  return (
    <div className={compact ? "link-form compact" : "link-form"}>
      <form action={action} noValidate className={compact ? "" : "form-grid"}>
        <input type="hidden" name="kind" value={kind} />
        {compact ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <>
            <div className="field">
              <label htmlFor={`${id}-email`}>E-mailadres van de tester</label>
              <input id={`${id}-email`} name="email" type="email" required autoComplete="off" defaultValue={email} />
            </div>
            <div className="field">
              <label htmlFor={`${id}-days`}>Geldig</label>
              <select id={`${id}-days`} name="days" defaultValue="7">
                <option value="1">1 dag</option>
                <option value="3">3 dagen</option>
                <option value="7">7 dagen</option>
                <option value="14">14 dagen</option>
              </select>
            </div>
          </>
        )}
        <div className="form-actions">
          <SubmitButton pendingText="Bezig…" className={compact ? "button secondary small" : "button"}>{kind === "herstel" ? "Herstellink maken" : "Uitnodiging maken"}</SubmitButton>
        </div>
      </form>
      <div aria-live="polite">
        {state?.error && (
          <p className="alert error" role="alert">
            {state.error}
          </p>
        )}
        {state?.link && (
          <div className="card link-result">
            <p>
              <strong>{state.kind === "herstel" ? "Herstellink" : "Uitnodiging"} voor {state.email}</strong>, geldig tot {dateFmt.format(new Date(state.expiresAt))}.
              Deze link zie je maar één keer; er wordt niets gemaild. Stuur hem zelf door.
            </p>
            <label className="visually-hidden" htmlFor={`${id}-link`}>
              Link
            </label>
            <input id={`${id}-link`} className="link-value" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
            <label className="visually-hidden" htmlFor={`${id}-text`}>
              Tekst om te versturen
            </label>
            <textarea id={`${id}-text`} className="link-text" readOnly rows={8} value={state.text} />
            <div className="button-row">
              <CopyButton text={state.link} label="Kopieer link" />
              <CopyButton text={state.text} label="Kopieer tekst met link" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
