"use client";
/**
 * BK-049/050/051: one research question. The owner edits it, links passages and notes, and writes
 * the answer. The status only changes when the owner picks it (no automatic closing, spec §9).
 */
import { QUESTION_STATUS_LABELS, QuestionStatus, type NoteSummary, type Question, type QuestionPassage } from "@bk/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { parseReference, type BookInfo } from "@/lib/notes/reference";

type Props = {
  question: Question;
  passages: QuestionPassage[];
  notes: NoteSummary[];
  candidates: { id: string; title: string }[];
  books: BookInfo[];
  translation: string;
};
type Links = { notes: NoteSummary[]; passages: QuestionPassage[] };

export function QuestionView({ question, passages: p0, notes: n0, candidates, books, translation }: Props) {
  const router = useRouter();
  const ids = useId();
  const [title, setTitle] = useState(question.title);
  const [description, setDescription] = useState(question.description);
  const [status, setStatus] = useState<QuestionStatus>(question.status);
  const [answer, setAnswer] = useState(question.answer);
  const [links, setLinks] = useState<Links>({ notes: n0, passages: p0 });
  const [ref, setRef] = useState("");
  const [refError, setRefError] = useState("");
  const [noteId, setNoteId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const b = await res?.json().catch(() => null);
      setError(b?.error?.message ?? "Dat is niet gelukt. Controleer je verbinding.");
      return null;
    }
    return res.json();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Schrijf de vraag op.");
    const r = await call(`/api/v1/questions/${question.id}`, "PATCH", { title, description, status, answer });
    if (r) {
      setMessage("Vraag opgeslagen.");
      router.refresh();
    }
  }

  async function link(body: unknown, done: string) {
    const r = (await call(`/api/v1/questions/${question.id}/links`, "POST", body)) as Links | null;
    if (r) {
      setLinks(r);
      setMessage(done);
    }
    return Boolean(r);
  }

  async function addPassage(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseReference(ref, books);
    if ("error" in parsed) return setRefError(parsed.error);
    setRefError("");
    const { book, label, ...range } = parsed;
    if (await link({ action: "addPassage", label, passage: { translation, book: book.code, ...range } }, `${label} is gekoppeld.`)) setRef("");
  }

  const linked = new Set(links.notes.map((n) => n.id));
  const addable = candidates.filter((c) => !linked.has(c.id));

  return (
    <>
      <p className="visually-hidden" role="status">
        {message}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <form className="question-form" onSubmit={save} noValidate>
        <div className="field">
          <label htmlFor={`${ids}-title`}>Vraag</label>
          <input id={`${ids}-title`} type="text" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={`${ids}-desc`}>Toelichting</label>
          <textarea id={`${ids}-desc`} rows={3} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field narrow">
          <label htmlFor={`${ids}-status`}>Status</label>
          <select id={`${ids}-status`} value={status} onChange={(e) => setStatus(QuestionStatus.parse(e.target.value))}>
            {QuestionStatus.options.map((s) => (
              <option key={s} value={s}>
                {QUESTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${ids}-answer`}>Mijn antwoord</label>
          <textarea id={`${ids}-answer`} rows={6} value={answer} maxLength={20000} onChange={(e) => setAnswer(e.target.value)} />
        </div>
        <button type="submit" className="button" disabled={busy}>
          Vraag opslaan
        </button>
      </form>

      <section className="settings-section" aria-labelledby={`${ids}-passages`}>
        <h2 id={`${ids}-passages`}>Bijbelgedeelten</h2>
        {links.passages.length === 0 ? (
          <p className="muted">Nog geen Bijbelgedeelten gekoppeld.</p>
        ) : (
          <ul className="link-list">
            {links.passages.map((p) => (
              <li key={p.id}>
                <Link href={`/bible/${p.book}/${p.startChapter}?v=${p.translation}`}>{p.label}</Link>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Koppeling ${p.label} verwijderen`}
                  disabled={busy}
                  onClick={() => void link({ action: "removePassage", passageId: p.id }, `${p.label} is losgekoppeld.`)}
                >
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="inline-add" onSubmit={addPassage} noValidate>
          <div className="field">
            <label htmlFor={`${ids}-ref`}>Bijbelgedeelte koppelen</label>
            <input
              id={`${ids}-ref`}
              type="text"
              placeholder="bijv. Rom 3:21-26"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              aria-invalid={refError ? true : undefined}
              aria-describedby={refError ? `${ids}-referr` : undefined}
            />
            {refError && (
              <p id={`${ids}-referr`} className="field-error">
                {refError}
              </p>
            )}
          </div>
          <button type="submit" className="button secondary" disabled={busy || !ref.trim()}>
            Koppel gedeelte
          </button>
        </form>
      </section>

      <section className="settings-section" aria-labelledby={`${ids}-notes`}>
        <h2 id={`${ids}-notes`}>Notities</h2>
        {links.notes.length === 0 ? (
          <p className="muted">Nog geen notities gekoppeld.</p>
        ) : (
          <ul className="link-list">
            {links.notes.map((n) => (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`}>{n.title || "Naamloze notitie"}</Link>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Notitie ${n.title || "Naamloze notitie"} loskoppelen`}
                  disabled={busy}
                  onClick={() => void link({ action: "removeNote", noteId: n.id }, "Notitie losgekoppeld.")}
                >
                  Loskoppelen
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="inline-add"
          onSubmit={async (e) => {
            e.preventDefault();
            if (noteId && (await link({ action: "addNote", noteId }, "Notitie gekoppeld."))) setNoteId("");
          }}
        >
          <div className="field">
            <label htmlFor={`${ids}-note`}>Notitie koppelen</label>
            <select id={`${ids}-note`} value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <option value="">Kies een notitie…</option>
              {addable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || "Naamloze notitie"}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="button secondary" disabled={busy || !noteId}>
            Koppel notitie
          </button>
        </form>
      </section>
    </>
  );
}
