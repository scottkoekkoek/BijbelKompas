"use client";
import { useActionState, useId } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { sendFeedback, type FeedbackState } from "./actions";

/** The page you came from (same site only) when the form is sent. */
function cameFrom(from: string | null): string {
  if (from) return from;
  try {
    const u = new URL(document.referrer);
    if (u.origin === window.location.origin && u.pathname !== "/feedback") return u.pathname;
  } catch {
    // no or unreadable referrer: send no page
  }
  return "";
}

/** The page and the screen size go along, so the administrator can see what you saw. */
export function FeedbackForm({ from }: { from: string | null }) {
  const [state, action] = useActionState<FeedbackState, FormData>(sendFeedback, undefined);
  const id = useId();

  function send(fd: FormData) {
    fd.set("page", cameFrom(from));
    fd.set("viewport", `${window.innerWidth}x${window.innerHeight}`);
    action(fd);
  }

  if (state?.ok) {
    return (
      <div className="alert info" role="status">
        Dank je wel! Je feedback is verstuurd. Alleen de beheerder van de pilot leest hem.
      </div>
    );
  }
  return (
    <form action={send} className="feedback-form">
      <div className="field">
        <label htmlFor={id}>Wat wil je kwijt?</label>
        <textarea
          id={id}
          name="message"
          rows={6}
          maxLength={4000}
          required
          placeholder="Wat werkte goed, wat was onduidelijk, wat miste je?"
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="hint">
          De pagina waar je vandaan kwam en je schermgrootte gaan mee. Je notities gaan niet mee.
        </p>
      </div>
      {state?.error && <p className="alert error" role="alert">{state.error}</p>}
      <div className="button-row">
        <SubmitButton pendingText="Versturen…">Feedback versturen</SubmitButton>
      </div>
    </form>
  );
}
