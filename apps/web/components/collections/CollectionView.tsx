"use client";
/** BK-047/048: the notes of one collection in order, adding and removing notes, editing, archiving. */
import { NOTE_TYPE_LABELS, type Collection, type NoteSummary } from "@bk/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { move } from "@/lib/collections/tree";
import { CollectionForm } from "./CollectionForm";

type Option = { id: string; name: string; depth: number };
type Props = {
  collection: Collection;
  notes: NoteSummary[];
  /** the owner's notes that can be added */
  candidates: { id: string; title: string }[];
  parents: Option[];
};

export function CollectionView({ collection, notes: initial, candidates, parents }: Props) {
  const router = useRouter();
  const ids = useId();
  const [notes, setNotes] = useState(initial);
  const [adding, setAdding] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function change(body: unknown, done: string) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/v1/collections/${collection.id}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const b = await res?.json().catch(() => null);
      setError(b?.error?.message ?? "Dat is niet gelukt. Controleer je verbinding.");
      return false;
    }
    setNotes(((await res.json()) as { notes: NoteSummary[] }).notes);
    setStatus(done);
    router.refresh();
    return true;
  }

  async function reorder(index: number, delta: -1 | 1) {
    const next = move(notes, index, delta);
    if (next === notes) return;
    const title = notes[index]!.title || "Naamloze notitie";
    setNotes(next);
    await change({ action: "order", noteIds: next.map((n) => n.id) }, `“${title}” staat nu op plaats ${index + delta + 1}.`);
  }

  async function patch(body: unknown) {
    setBusy(true);
    const res = await fetch(`/api/v1/collections/${collection.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Dat is niet gelukt. Controleer je verbinding.");
    router.refresh();
  }

  const inIt = new Set(notes.map((n) => n.id));
  const addable = candidates.filter((c) => !inIt.has(c.id));

  return (
    <>
      <p className="visually-hidden" role="status">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <section aria-labelledby={`${ids}-notes`}>
        <h2 id={`${ids}-notes`}>Notities in deze collectie</h2>
        {notes.length === 0 ? (
          <p className="placeholder">Er staan nog geen notities in. Voeg er hieronder een toe.</p>
        ) : (
          <ol className="collection-items">
            {notes.map((n, i) => {
              const title = n.title || "Naamloze notitie";
              return (
                <li key={n.id}>
                  <div>
                    <Link href={`/notes/${n.id}`} className="note-list-title">
                      {title}
                    </Link>
                    <span className="note-list-meta">
                      {" "}
                      · {NOTE_TYPE_LABELS[n.noteType]}
                      {n.eventDate && ` · ${new Date(n.eventDate).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}`}
                    </span>
                  </div>
                  <div className="part-actions">
                    <button type="button" className="tool" aria-label={`${title} omhoog`} disabled={busy || i === 0} onClick={() => void reorder(i, -1)}>
                      ↑
                    </button>
                    <button type="button" className="tool" aria-label={`${title} omlaag`} disabled={busy || i === notes.length - 1} onClick={() => void reorder(i, 1)}>
                      ↓
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`${title} uit deze collectie halen`}
                      disabled={busy}
                      onClick={() => void change({ action: "remove", noteId: n.id }, `“${title}” is uit de collectie gehaald. De notitie zelf blijft bestaan.`)}
                    >
                      Uit collectie
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <form
          className="inline-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!adding) return;
            const title = candidates.find((c) => c.id === adding)?.title || "Naamloze notitie";
            if (await change({ action: "add", noteId: adding }, `“${title}” is toegevoegd.`)) setAdding("");
          }}
        >
          <div className="field">
            <label htmlFor={`${ids}-add`}>Notitie toevoegen</label>
            <select id={`${ids}-add`} value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Kies een notitie…</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || "Naamloze notitie"}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button secondary" disabled={busy || !adding}>
            Toevoegen
          </button>
        </form>
      </section>

      <section className="settings-section" aria-label="Collectie beheren">
        {editing ? (
          <CollectionForm collection={collection} parents={parents} onDone={() => setEditing(false)} />
        ) : (
          <div className="button-row">
            <button type="button" className="button secondary" onClick={() => setEditing(true)}>
              Collectie bewerken
            </button>
            <Link className="button secondary" href={`/collections?nieuw=${collection.id}`}>
              Subcollectie maken
            </Link>
            <button type="button" className="button secondary" disabled={busy} onClick={() => void patch({ archived: !collection.archived })}>
              {collection.archived ? "Terughalen uit archief" : "Archiveren"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
