"use client";
/**
 * Feature 2: a quick note, e.g. during a sermon. One text field, no title, template or collection
 * needed. Saved through the existing offline outbox (same as the editor), so it is kept on the
 * device first and then sent; tapping "Bewaar als concept" twice still makes one note, because
 * the note id is fixed when the form opens.
 */
import { EMPTY_SERMON } from "@bk/schemas";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { listOutbox, saveLocal } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";
import { quickNoteDocument, quickNoteTitle, type QuickPassage } from "@/lib/notes/quick";

type State = "edit" | "saving" | "local" | "synced" | "error";
type Props = { passage: QuickPassage | null; onClose: () => void };

export function QuickNoteForm({ passage, onClose }: Props) {
  const ids = useId();
  const [noteId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [state, setState] = useState<State>("edit");
  const [message, setMessage] = useState("");
  const saving = useRef(false);

  // after saving: follow the outbox until the server has the note
  useEffect(() => {
    if (state !== "local") return;
    let alive = true;
    const check = async () => {
      const waiting = (await listOutbox().catch(() => [])).some((e) => e.noteId === noteId);
      if (alive && !waiting) setState("synced");
    };
    const stop = syncEngine.subscribe(() => void check());
    void check();
    return () => {
      alive = false;
      stop();
    };
  }, [state, noteId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving.current || state === "local" || state === "synced") return;
    if (!text.trim()) {
      setMessage("Schrijf eerst iets op.");
      return;
    }
    saving.current = true;
    setState("saving");
    setMessage("");
    const now = new Date();
    const content = {
      title: quickNoteTitle(text, passage, now),
      noteType: (passage ? "bijbelstudie" : "vrij") as "bijbelstudie" | "vrij",
      eventDate: null,
      sermon: EMPTY_SERMON,
      document: quickNoteDocument(text, passage, () => crypto.randomUUID()),
    };
    try {
      await saveLocal(noteId, { content }, { createdLocally: true });
      syncEngine.syncSoon(0);
      setState("local");
    } catch {
      // no storage on this device (private window, full disk): send it straight to the server once
      const res = await fetch("/api/v1/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: content.title, noteType: content.noteType, document: content.document }),
      }).catch(() => null);
      if (res?.ok) {
        setState("synced");
      } else {
        saving.current = false;
        setState("error");
        setMessage("Bewaren is niet gelukt. Je tekst staat er nog; probeer het opnieuw.");
      }
    }
  }

  const saved = state === "local" || state === "synced";
  return (
    <form className="quick-form" onSubmit={(e) => void save(e)} noValidate>
      {passage && (
        <p className="quick-passage">
          <span className="badge">Bij</span> {passage.label}
        </p>
      )}
      <div className="field">
        <label htmlFor={`${ids}-text`}>Aantekening</label>
        <textarea
          id={`${ids}-text`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={20000}
          readOnly={saved}
          aria-describedby={message ? `${ids}-msg` : undefined}
          aria-invalid={state === "edit" && !!message ? true : undefined}
          autoFocus
        />
      </div>
      <p id={`${ids}-msg`} role="status" className={state === "error" || (state === "edit" && message) ? "field-error" : "hint"}>
        {state === "local"
          ? "Bewaard op dit apparaat. Wordt naar de server gestuurd…"
          : state === "synced"
            ? "Opgeslagen als concept in Notities."
            : message}
      </p>
      <div className="button-row">
        {saved ? (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Verder lezen
            </button>
            <Link className="button" href={`/notes/${noteId}`}>
              Open in de editor
            </Link>
          </>
        ) : (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Annuleren
            </button>
            <button type="submit" className="button" disabled={state === "saving"}>
              Bewaar als concept
            </button>
          </>
        )}
      </div>
    </form>
  );
}
