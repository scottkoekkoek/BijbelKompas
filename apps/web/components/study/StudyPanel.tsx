"use client";
/** Feature 1: "Mijn studie bij dit vers": the owner's notes and questions linked to the selection. */
import { NOTE_TYPE_LABELS, QUESTION_STATUS_LABELS, type NoteType, type QuestionStatus } from "@bk/schemas";
import Link from "next/link";
import { useEffect, useState } from "react";

type Study = {
  notes: { id: string; title: string; noteType: NoteType; references: string[]; blockId: string | null }[];
  questions: { id: string; title: string; status: QuestionStatus; label: string }[];
};
type Props = {
  query: { translation: string; book: string; chapter: number; from: number; to: number };
  onQuickNote: () => void;
  onAsk: () => void;
};

export function StudyPanel({ query, onQuickNote, onAsk }: Props) {
  const [study, setStudy] = useState<Study | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ translation: query.translation, book: query.book, chapter: String(query.chapter), from: String(query.from), to: String(query.to) });
    fetch(`/api/v1/passages/study?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Study>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => alive && setStudy(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [query.translation, query.book, query.chapter, query.from, query.to]);

  if (failed) return <p className="alert error" role="alert">Je studie kon niet worden geladen. Controleer je verbinding.</p>;
  if (!study)
    return (
      <div aria-busy="true" aria-label="Laden">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    );

  const empty = study.notes.length === 0 && study.questions.length === 0;
  return (
    <div className="study">
      {empty ? (
        <p className="study-empty">Je hebt bij deze verzen nog geen notities of vragen.</p>
      ) : (
        <>
          {study.notes.length > 0 && (
            <section className="study-group" aria-labelledby="study-notes">
              <h3 id="study-notes">Notities ({study.notes.length})</h3>
              <ul className="study-list">
                {study.notes.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}${n.blockId ? `#blok-${n.blockId}` : ""}`}>
                      <span className="study-title">{n.title || "Naamloze notitie"}</span>
                      <span className="study-meta">
                        {NOTE_TYPE_LABELS[n.noteType]} · {n.references.join(", ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {study.questions.length > 0 && (
            <section className="study-group" aria-labelledby="study-questions">
              <h3 id="study-questions">Onderzoeksvragen ({study.questions.length})</h3>
              <ul className="study-list">
                {study.questions.map((q) => (
                  <li key={q.id}>
                    <Link href={`/questions/${q.id}`}>
                      <span className="study-title">{q.title}</span>
                      <span className="study-meta">
                        {QUESTION_STATUS_LABELS[q.status]} · {q.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <div className="button-row">
        <button type="button" className="button secondary" onClick={onQuickNote}>
          Snelle aantekening
        </button>
        <button type="button" className="button secondary" onClick={onAsk}>
          Stel een vraag
        </button>
      </div>
    </div>
  );
}
