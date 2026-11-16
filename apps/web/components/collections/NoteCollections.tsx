"use client";
/** BK-048: put this note in one or more collections (it is never copied). */
import type { QuestionStatus } from "@bk/schemas";
import { QUESTION_STATUS_LABELS } from "@bk/schemas";
import Link from "next/link";
import { useId, useState } from "react";

type Props = {
  noteId: string;
  collections: { id: string; name: string; depth: number }[];
  memberOf: string[];
  questions: { id: string; title: string; status: QuestionStatus }[];
};

export function NoteCollections({ noteId, collections, memberOf, questions }: Props) {
  const ids = useId();
  const [member, setMember] = useState(new Set(memberOf));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const set = (id: string, on: boolean) =>
    setMember((m) => {
      const next = new Set(m);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function toggle(id: string, name: string, on: boolean) {
    set(id, on); // show the choice at once; undo it if the server says no
    setBusy(id);
    setError("");
    const res = await fetch(`/api/v1/collections/${id}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: on ? "add" : "remove", noteId }),
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      set(id, !on);
      return setError("Dat is niet gelukt. Controleer je verbinding.");
    }
    setMessage(on ? `Toegevoegd aan ${name}.` : `Uit ${name} gehaald.`);
  }

  return (
    <section className="note-relations" aria-labelledby={`${ids}-h`}>
      <h2 id={`${ids}-h`} className="visually-hidden">
        Collecties en vragen
      </h2>
      <details>
        <summary>
          Collecties {member.size > 0 && <span className="count">({member.size})</span>}
        </summary>
        {collections.length === 0 ? (
          <p className="muted">
            Je hebt nog geen collecties. <Link href="/collections">Maak een collectie</Link>.
          </p>
        ) : (
          <fieldset className="collection-checks">
            <legend className="visually-hidden">In welke collecties staat deze notitie?</legend>
            {collections.map((c) => (
              <label key={c.id} className="check" style={{ paddingLeft: c.depth * 18 }}>
                <input type="checkbox" checked={member.has(c.id)} disabled={busy === c.id} onChange={(e) => void toggle(c.id, c.name, e.target.checked)} />
                {c.name}
              </label>
            ))}
          </fieldset>
        )}
        <p className="visually-hidden" role="status">
          {message}
        </p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
      </details>
      {questions.length > 0 && (
        <p className="note-list-meta">
          Gekoppeld aan {questions.length === 1 ? "de vraag" : "de vragen"}{" "}
          {questions.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ", "}
              <Link href={`/questions/${q.id}`}>{q.title}</Link> ({QUESTION_STATUS_LABELS[q.status].toLowerCase()})
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
