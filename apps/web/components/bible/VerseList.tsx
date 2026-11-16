"use client";
import type { ChapterVerse } from "@bk/schemas";
import { useEffect, useState } from "react";
import { NewNoteButton } from "@/components/notes/NewNoteButton";
import { formatReference, nextSelection, type Selection } from "@/lib/bible";

type Props = {
  verses: ChapterVerse[];
  bookCode: string;
  bookName: string;
  chapter: number;
  translationCode: string;
  /** verse numbers that have at least one note */
  noted?: number[];
};

/** BK-012 (give it a key per chapter so the selection resets): tap a verse to select it, tap another to make a range; copy the reference or the text. */
export function VerseList({ verses, bookCode, bookName, chapter, translationCode, noted = [] }: Props) {
  const [selection, setSelection] = useState<Selection>(null);
  const [status, setStatus] = useState("");

  // Remember where the owner is reading. Failing to save is harmless, so it stays silent.
  useEffect(() => {
    void fetch("/api/v1/me/reading-position", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ translation: translationCode, book: bookCode, chapter }),
    }).catch(() => undefined);
  }, [translationCode, bookCode, chapter]);

  const reference = formatReference(bookName, chapter, selection, translationCode);
  const isSelected = (n: number) => !!selection && n >= selection.from && n <= selection.to;

  function toggle(n: number) {
    setSelection((s) => nextSelection(s, n));
    setStatus("");
  }

  async function copy(kind: "reference" | "text") {
    const text =
      kind === "reference"
        ? reference
        : `${verses
            .filter((v) => isSelected(v.verse))
            .map((v) => `${v.verse} ${v.text}`)
            .join(" ")}\n${reference}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(kind === "reference" ? "Verwijzing gekopieerd." : "Tekst gekopieerd.");
    } catch {
      setStatus("Kopiëren lukt niet in deze browser.");
    }
  }

  return (
    <>
      <div className="bible-text">
        {verses.map((v) => (
          <span key={v.verse} id={`v${v.verse}`} className={isSelected(v.verse) ? "verse selected" : "verse"} data-verse={v.verse}>
            <button
              type="button"
              className="verse-num"
              aria-pressed={isSelected(v.verse)}
              aria-label={`Vers ${v.verse} selecteren`}
              onClick={() => toggle(v.verse)}
            >
              {v.verse}
            </button>
            {noted.includes(v.verse) && (
              <span className="note-dot" title="Er is een notitie bij dit vers">
                <span className="visually-hidden">(notitie)</span>
              </span>
            )}{" "}
            <span className="verse-text" onClick={() => toggle(v.verse)}>
              {v.text}
            </span>{" "}
          </span>
        ))}
      </div>

      {selection && (
        <div className="selection-bar" role="region" aria-label="Geselecteerde verzen">
          <strong className="selection-ref">{reference}</strong>
          <div className="selection-actions">
            <button type="button" className="button" onClick={() => copy("reference")}>
              Kopieer verwijzing
            </button>
            <button type="button" className="button secondary" onClick={() => copy("text")}>
              Kopieer tekst
            </button>
            <NewNoteButton
              label="In notitie zetten"
              className="button secondary"
              input={{
                reference: {
                  translation: translationCode,
                  book: bookCode,
                  startChapter: chapter,
                  startVerse: selection.from,
                  endChapter: chapter,
                  endVerse: selection.to,
                },
              }}
            />
            <button type="button" className="button secondary" onClick={() => setSelection(null)}>
              Wissen
            </button>
          </div>
        </div>
      )}
      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status && (
        <p className="copy-status" aria-hidden="true">
          {status}
        </p>
      )}
    </>
  );
}
