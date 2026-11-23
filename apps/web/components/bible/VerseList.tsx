"use client";
import type { ChapterHighlight, ChapterVerse, HighlightColor } from "@bk/schemas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QuickNoteForm } from "@/components/study/QuickNoteForm";
import { QuickQuestionForm } from "@/components/study/QuickQuestionForm";
import { StudyPanel } from "@/components/study/StudyPanel";
import { Sheet } from "@/components/ui/Sheet";
import type { QuickPassage } from "@/lib/notes/quick";
import { NewNoteButton } from "@/components/notes/NewNoteButton";
import { ExplainVerses } from "@/components/ai/ExplainVerses";
import { HighlightEditor } from "./HighlightEditor";
import { markReading } from "./reading";
import { formatReference, nextSelection, type Selection } from "@/lib/bible";

type LinkedNote = { noteId: string; title: string; blockId: string; reference: string; snippet: string };

type Props = {
  verses: ChapterVerse[];
  bookCode: string;
  bookName: string;
  chapter: number;
  translationCode: string;
  /** verse numbers that have at least one note */
  noted?: number[];
  /** BK-013: the owner's highlights, in this translation's verse numbers */
  highlights?: ChapterHighlight[];
  /** audit BK-01: the verse or range a link pointed at; marked and scrolled into view */
  target?: { from: number; to: number } | null;
  /** feature 6: verse numbers the owner marked as read */
  read?: number[];
  /** ADR-017: set only when AI is on, a provider is set and this translation may go to AI */
  explainWith?: { name: string; external: boolean } | null;
};

/** BK-012 (give it a key per chapter so the selection resets): tap a verse to select it, tap another to make a range; copy the reference or the text. */
/** How many linked notes the selection bar shows before pointing to Mijn studie. */
const LINKED_PREVIEW = 3;
const firstWord = (t: string) => /^\S*/.exec(t)?.[0] ?? "";
const restOf = (t: string) => t.slice(firstWord(t).length);

export function VerseList({ verses, bookCode, bookName, chapter, translationCode, noted = [], highlights = [], target = null, read = [], explainWith = null }: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<Selection>(null);
  const [marking, setMarking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [linked, setLinked] = useState<LinkedNote[] | null>(null);
  // features 1-3: one panel at a time on top of the reader; the selection stays as it was
  const [panel, setPanel] = useState<null | "studie" | "aantekening" | "vraag">(null);

  // BK-031: the notes linked to the selected verses (only asked when a selected verse has a note).
  const hasNoted = !!selection && noted.some((n) => n >= selection.from && n <= selection.to);
  useEffect(() => {
    if (!selection || !hasNoted) return;
    let alive = true;
    const q = new URLSearchParams({ translation: translationCode, book: bookCode, chapter: String(chapter), from: String(selection.from), to: String(selection.to) });
    fetch(`/api/v1/passages/notes?${q}`)
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((b: { notes: LinkedNote[] }) => alive && setLinked(b.notes))
      .catch(() => alive && setLinked([]));
    return () => {
      alive = false;
      setLinked(null);
    };
  }, [selection, hasNoted, translationCode, bookCode, chapter]);

  // audit BK-01: land on the exact verse, also after a reload or a client-side navigation
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(`v${target.from}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [target]);

  // Remember where the owner is reading. Failing to save is harmless, so it stays silent.
  useEffect(() => {
    void fetch("/api/v1/me/reading-position", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ translation: translationCode, book: bookCode, chapter }),
    }).catch(() => undefined);
  }, [translationCode, bookCode, chapter]);

  const reference = formatReference(bookName, chapter, selection, translationCode);
  const passage: QuickPassage | null = selection
    ? { translation: translationCode, book: bookCode, startChapter: chapter, startVerse: selection.from, endChapter: chapter, endVerse: selection.to, label: formatReference(bookName, chapter, selection) }
    : null;
  const isSelected = (n: number) => !!selection && n >= selection.from && n <= selection.to;
  const isRead = (n: number) => read.includes(n);
  // feature 6: a selection that is read completely can be marked unread again
  const selectionRead = !!selection && verses.filter((v) => isSelected(v.verse)).every((v) => isRead(v.verse));

  async function markRead(asRead: boolean) {
    if (!selection) return;
    setBusy(true);
    try {
      await markReading({ translation: translationCode, book: bookCode, chapter, from: selection.from, to: selection.to, read: asRead });
      setStatus(asRead ? `${reference} gemarkeerd als gelezen.` : `${reference} weer op ongelezen gezet.`);
      router.refresh();
    } catch {
      setStatus("Je leesvoortgang is niet bewaard. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  function toggle(n: number) {
    setSelection((s) => nextSelection(s, n));
    setStatus("");
    setMarking(false);
  }

  // the last highlight covering a verse decides its color
  const highlightOf = (n: number) => highlights.filter((h) => h.verses.includes(n)).at(-1);

  async function mark(color: HighlightColor, annotation: string) {
    if (!selection) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/highlights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passage: { translation: translationCode, book: bookCode, startChapter: chapter, startVerse: selection.from, endChapter: chapter, endVerse: selection.to },
          label: formatReference(bookName, chapter, selection),
          color,
          annotation,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("Gemarkeerd.");
      setMarking(false);
      setSelection(null);
      router.refresh();
    } catch {
      setStatus("Markeren is niet gelukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
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
        {verses.map((v) => {
          const h = highlightOf(v.verse);
          return (
          <span
            key={v.verse}
            id={`v${v.verse}`}
            className={["verse", isSelected(v.verse) && "selected", target && v.verse >= target.from && v.verse <= target.to && "target", isRead(v.verse) && "read", h && `hl hl-${h.color}`].filter(Boolean).join(" ")}
            data-verse={v.verse}
            title={h?.annotation || undefined}
          >
            {/* the verse number and the first word stay on one line */}
            <span className="verse-start">
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
                {firstWord(v.text)}
              </span>
            </span>
            <span className="verse-text" onClick={() => toggle(v.verse)}>
              {restOf(v.text)}
            </span>
            {h && <span className="visually-hidden"> (gemarkeerd{h.annotation ? `: ${h.annotation}` : ""})</span>}
            {isRead(v.verse) && <span className="visually-hidden"> (gelezen)</span>}{" "}
          </span>
          );
        })}
      </div>

      {selection && (
        <div className="selection-bar" role="region" aria-label="Geselecteerde verzen">
          <strong className="selection-ref">{reference}</strong>
          <div className="selection-actions study-actions">
            <button type="button" className="button" onClick={() => setPanel("studie")}>
              Mijn studie
            </button>
            <button type="button" className="button secondary" onClick={() => setPanel("aantekening")}>
              Snelle aantekening
            </button>
            <button type="button" className="button secondary" onClick={() => setPanel("vraag")}>
              Stel een vraag
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
          </div>
          <div className="selection-actions tool-actions">
            <details className="copy-menu">
              <summary className="button ghost">Kopiëren</summary>
              <div className="copy-menu-items">
                <button type="button" className="button ghost" onClick={() => copy("reference")}>
                  Kopieer verwijzing
                </button>
                <button type="button" className="button ghost" onClick={() => copy("text")}>
                  Kopieer tekst
                </button>
              </div>
            </details>
            <button type="button" className="button ghost" onClick={() => setMarking((m) => !m)} aria-expanded={marking}>
              Markeren
            </button>
            <button type="button" className="button ghost" disabled={busy} onClick={() => void markRead(!selectionRead)}>
              {selectionRead ? "Markeer als ongelezen" : "Markeer als gelezen"}
            </button>
            <button type="button" className="button ghost" onClick={() => setSelection(null)}>
              Wissen
            </button>
          </div>
          {explainWith && (
            <ExplainVerses
              key={`${selection.from}-${selection.to}`}
              passage={{ translation: translationCode, book: bookCode, chapter, from: selection.from, to: selection.to }}
              provider={explainWith}
            />
          )}
          {marking && <HighlightEditor saveLabel="Markering opslaan" busy={busy} onSave={(c, a) => void mark(c, a)} onCancel={() => setMarking(false)} />}
          {hasNoted && linked && linked.length > 0 && (
            <section className="verse-notes" aria-label="Notities bij deze verzen">
              <h2>Notities bij deze verzen</h2>
              <ul>
                {linked.slice(0, LINKED_PREVIEW).map((n) => (
                  <li key={`${n.noteId}-${n.blockId}`}>
                    <Link href={`/notes/${n.noteId}#blok-${n.blockId}`}>{n.title || "Naamloze notitie"}</Link>
                    <span className="muted"> · {n.reference}</span>
                    {n.snippet && <p className="verse-note-snippet">{n.snippet}</p>}
                  </li>
                ))}
              </ul>
              {linked.length > LINKED_PREVIEW && (
                <button type="button" className="button ghost small" onClick={() => setPanel("studie")}>
                  Alle {linked.length} notities in Mijn studie
                </button>
              )}
            </section>
          )}
        </div>
      )}
      {selection && (
        <>
          <Sheet open={panel === "studie"} onClose={() => setPanel(null)} title={`Mijn studie bij ${passage!.label}`}>
            <StudyPanel
              query={{ translation: translationCode, book: bookCode, chapter, from: selection.from, to: selection.to }}
              onQuickNote={() => setPanel("aantekening")}
              onAsk={() => setPanel("vraag")}
            />
          </Sheet>
          <Sheet open={panel === "aantekening"} onClose={() => setPanel(null)} title="Snelle aantekening">
            <QuickNoteForm passage={passage} onClose={() => setPanel(null)} />
          </Sheet>
          <Sheet open={panel === "vraag"} onClose={() => setPanel(null)} title="Stel een vraag">
            <QuickQuestionForm passage={passage!} onClose={() => setPanel(null)} onSaved={() => router.refresh()} />
          </Sheet>
        </>
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
