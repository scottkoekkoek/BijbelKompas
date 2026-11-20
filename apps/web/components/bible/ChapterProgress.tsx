"use client";
// Feature 6: the reading status of this chapter, at its end, with "mark as read" and its undo.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { passagePath } from "@/lib/bible";
import { CHAPTER_STATUS_LABELS, type ChapterStatus } from "@/lib/reader/progress-status";
import { markReading } from "./reading";

type Props = {
  translation: string;
  book: string;
  bookName: string;
  chapter: number;
  status: ChapterStatus;
  read: number;
  total: number;
  /** first unread verse of this chapter (canonical numbering), when partly read */
  nextVerse: number | null;
};

export function ChapterProgress({ translation, book, bookName, chapter, status, read, total, nextVerse }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function set(readAll: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await markReading({ translation, book, chapter, from: 1, to: 999, read: readAll });
      setMessage({ kind: "ok", text: readAll ? `${bookName} ${chapter} staat op Gelezen.` : `${bookName} ${chapter} staat weer op Ongelezen.` });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "Je leesvoortgang is niet bewaard. Probeer het opnieuw." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chapter-progress" aria-labelledby="chapter-progress-title">
      <h2 id="chapter-progress-title" className="visually-hidden">
        Leesvoortgang
      </h2>
      <p className="chapter-progress-status">
        <span className={`read-badge ${status}`}>{CHAPTER_STATUS_LABELS[status]}</span>
        {status === "deels" && (
          <span className="muted">
            {read} van {total} verzen
          </span>
        )}
      </p>
      <div className="chapter-progress-actions">
        {status !== "gelezen" && (
          <button type="button" className="button secondary" disabled={busy} onClick={() => void set(true)}>
            Markeer hoofdstuk als gelezen
          </button>
        )}
        {status !== "ongelezen" && (
          <button type="button" className="button ghost" disabled={busy} onClick={() => void set(false)}>
            Markeer hoofdstuk als ongelezen
          </button>
        )}
        {status === "deels" && nextVerse && (
          <Link className="button ghost" href={passagePath({ book, startChapter: chapter, startVerse: nextVerse, endChapter: chapter, endVerse: nextVerse, translation })}>
            Naar eerste ongelezen vers
          </Link>
        )}
      </div>
      <p className="hint chapter-progress-msg" role="status" aria-live="polite">
        {message?.kind === "ok" ? message.text : ""}
      </p>
      {message?.kind === "error" && (
        <p className="alert error" role="alert">
          {message.text}
        </p>
      )}
    </section>
  );
}
