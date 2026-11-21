"use client";
/**
 * Feature 3: a research question straight from a verse selection. Saved with status Open through
 * the existing questions route, linked to exactly the selected passage.
 */
import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { QuickPassage } from "@/lib/notes/quick";

type Props = { passage: QuickPassage; onClose: () => void; onSaved?: () => void };

export function QuickQuestionForm({ passage, onClose, onSaved }: Props) {
  const ids = useId();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const saving = useRef(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || savedId) return;
    if (!title.trim()) return setError("Schrijf eerst je vraag op.");
    saving.current = true;
    setBusy(true);
    setError("");
    const { label, ...ref } = passage;
    const res = await fetch("/api/v1/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), passage: ref, label }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      saving.current = false;
      const body = await res?.json().catch(() => null);
      return setError(body?.error?.message ?? "Bewaren is niet gelukt. Je vraag staat er nog; controleer je verbinding.");
    }
    setSavedId(((await res.json()) as { id: string }).id);
    onSaved?.();
  }

  return (
    <form className="quick-form" onSubmit={(e) => void save(e)} noValidate>
      <p className="quick-passage">
        <span className="badge">Bij</span> {passage.label}
      </p>
      <div className="field">
        <label htmlFor={`${ids}-q`}>Je vraag</label>
        <textarea
          id={`${ids}-q`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          rows={3}
          readOnly={!!savedId}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${ids}-msg`}
          autoFocus
        />
      </div>
      <p id={`${ids}-msg`} role="status" className={error ? "field-error" : "hint"}>
        {savedId ? "Vraag bewaard met status Open." : error}
      </p>
      <div className="button-row">
        {savedId ? (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Verder lezen
            </button>
            <Link className="button" href={`/questions/${savedId}`}>
              Naar de vraag
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Annuleren
            </button>
            <button type="submit" className="button" disabled={busy}>
              Vraag bewaren
            </button>
          </>
        )}
      </div>
    </form>
  );
}
