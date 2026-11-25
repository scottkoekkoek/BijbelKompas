"use client";
/**
 * Feature 2: a quick note, e.g. during a sermon. One text field, no title, template or collection
 * needed. Saved through the existing offline outbox (same as the editor), so it is kept on the
 * device first and then sent; tapping "Bewaar als concept" twice still makes one note, because
 * the note id is fixed when the form opens.
 *
 * Ronde 4 (A1, A2, V6): "Ik zit in een preek" makes it a sermon note of today, with the church of the
 * last sermon filled in; a reference typed in the text ("Joh 15:5") can be linked with one tap.
 */
import { EMPTY_SERMON, type SermonDetails } from "@bk/schemas";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LinkedPassage } from "@/lib/notes/document";
import { localDate, sermonPreset } from "@/lib/notes/preekmodus";
import { quickNoteDocument, quickNoteTitle, type QuickPassage } from "@/lib/notes/quick";
import { findReferences, type BookInfo, type ParsedRef } from "@/lib/notes/reference";
import { listOutbox, saveLocal } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";

type State = "edit" | "saving" | "local" | "synced" | "error";
export type SermonOption = { start: boolean; last: SermonDetails | null };
type Props = {
  passage: QuickPassage | null;
  onClose: () => void;
  /** with the books, references in the text are recognised */
  books?: BookInfo[];
  translation?: string;
  /** offers "Ik zit in een preek" (only without a passage) */
  sermon?: SermonOption;
};

const keyOf = (text: string) => text.toLowerCase().replace(/[\s.]/g, "");
const toLinked = (r: ParsedRef, translation: string): LinkedPassage => ({
  translation,
  book: r.book.code,
  startChapter: r.startChapter,
  startVerse: r.startVerse,
  endChapter: r.endChapter,
  endVerse: r.endVerse,
  label: r.label,
});

export function QuickNoteForm({ passage, onClose, books, translation = "SV", sermon }: Props) {
  const ids = useId();
  const [noteId] = useState(() => crypto.randomUUID());
  const [text, setText] = useState("");
  const [state, setState] = useState<State>("edit");
  const [message, setMessage] = useState("");
  const [isSermon, setIsSermon] = useState(Boolean(sermon?.start) && !passage);
  const [details, setDetails] = useState<SermonDetails>(() => sermonPreset(new Date(), sermon?.last ?? null));
  // accepted references: the typed text ("joh15:5") → the passage the writer chose
  const [linked, setLinked] = useState<Map<string, ParsedRef>>(() => new Map());
  const saving = useRef(false);

  const found = useMemo(() => (books ? findReferences(text, books) : []), [text, books]);
  const shown = found.filter((f, i) => found.findIndex((g) => keyOf(g.text) === keyOf(f.text)) === i);

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

  function toggle(key: string, ref: ParsedRef) {
    setLinked((prev) => {
      const next = new Map(prev);
      if (next.get(key)?.book.code === ref.book.code) next.delete(key);
      else next.set(key, ref);
      return next;
    });
  }

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
    const linksFor = (line: string) =>
      books
        ? findReferences(line, books).flatMap((f) => {
            const r = linked.get(keyOf(f.text));
            return r ? [toLinked(r, translation)] : [];
          })
        : [];
    const content = {
      title: quickNoteTitle(text, passage, now),
      noteType: (isSermon ? "preek" : passage ? "bijbelstudie" : "vrij") as "preek" | "bijbelstudie" | "vrij",
      eventDate: isSermon ? localDate(now) : null,
      sermon: isSermon ? details : EMPTY_SERMON,
      document: quickNoteDocument(text, passage, () => crypto.randomUUID(), linksFor),
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
        body: JSON.stringify({
          title: content.title,
          noteType: content.noteType,
          document: content.document,
          ...(content.eventDate ? { eventDate: content.eventDate } : {}),
        }),
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
  const setDetail = (k: "organization" | "serviceType", v: string) => setDetails((d) => ({ ...d, [k]: v.trim() ? v.slice(0, k === "organization" ? 120 : 60) : null }));
  return (
    <form className="quick-form" onSubmit={(e) => void save(e)} noValidate>
      {passage && (
        <p className="quick-passage">
          <span className="badge">Bij</span> {passage.label}
        </p>
      )}
      {sermon && !passage && (
        <div className="quick-sermon">
          <label className="check">
            <input type="checkbox" checked={isSermon} disabled={saved} onChange={(e) => setIsSermon(e.target.checked)} />
            Ik zit in een preek
          </label>
          {isSermon && (
            <div className="quick-sermon-fields">
              <p className="hint">Wordt een preeknotitie van vandaag, zodat je hem terugvindt in de tijdlijn.</p>
              <div className="form-row">
                <div className="field">
                  <label htmlFor={`${ids}-org`}>Gemeente</label>
                  <input id={`${ids}-org`} value={details.organization ?? ""} readOnly={saved} maxLength={120} onChange={(e) => setDetail("organization", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor={`${ids}-svc`}>Dienst</label>
                  <input id={`${ids}-svc`} value={details.serviceType ?? ""} readOnly={saved} maxLength={60} onChange={(e) => setDetail("serviceType", e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>
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
      {shown.length > 0 && !saved && (
        <div className="found-refs" role="group" aria-label="Herkende Bijbelverwijzingen">
          <span className="hint">Koppelen?</span>
          <ul>
            {shown.flatMap((f) =>
              f.refs.map((r) => {
                const on = linked.get(keyOf(f.text))?.book.code === r.book.code;
                return (
                  <li key={`${keyOf(f.text)}-${r.book.code}`}>
                    <button type="button" className={`passage-chip toggle${on ? " on" : ""}`} aria-pressed={on} onClick={() => toggle(keyOf(f.text), r)}>
                      {on ? "✓ " : "+ "}
                      {r.label}
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      )}
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
              {passage ? "Verder lezen" : "Sluiten"}
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
