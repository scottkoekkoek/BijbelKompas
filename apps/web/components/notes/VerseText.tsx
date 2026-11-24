"use client";
/**
 * Ronde 4 (V12): the text of a referenced passage, folded open under the reference in the reading
 * view, so you don't have to leave the note. Only for translations whose text may be shown (never
 * HSV or NBV21). From this device first when the translation is kept offline, otherwise from the server.
 */
import { useId, useState } from "react";
import { getBibleChapter } from "@/lib/offline/db";

type Ref = { translation: string; book: string; startChapter: number; startVerse: number; endChapter: number; endVerse: number; label: string };
type Verse = { chapter: number; verse: number; text: string };

const MAX_CHAPTERS = 3;

async function chapterVerses(translation: string, book: string, chapter: number): Promise<{ verse: number; text: string }[] | null> {
  const local = await getBibleChapter(translation, book, chapter).catch(() => undefined);
  if (local) return local.verses;
  const res = await fetch(`/api/v1/bible/${encodeURIComponent(translation)}/${encodeURIComponent(book)}/${chapter}`).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { verses: { verse: number; text: string }[] }).verses;
}

export function VerseText({ passage }: { passage: Ref }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [verses, setVerses] = useState<Verse[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || verses) return;
    setState("loading");
    const out: Verse[] = [];
    const last = Math.min(passage.endChapter, passage.startChapter + MAX_CHAPTERS - 1);
    for (let c = passage.startChapter; c <= last; c++) {
      const list = await chapterVerses(passage.translation, passage.book, c);
      if (!list) {
        setState("error");
        return;
      }
      for (const v of list) {
        const from = c === passage.startChapter ? passage.startVerse : 1;
        const to = c === passage.endChapter ? passage.endVerse : 999;
        if (v.verse >= from && v.verse <= to) out.push({ chapter: c, ...v });
      }
    }
    setVerses(out);
    setState("idle");
  }

  const multi = passage.endChapter > passage.startChapter;
  return (
    <div className="verse-text">
      <button type="button" className="link-button" aria-expanded={open} aria-controls={`${id}-t`} onClick={() => void toggle()}>
        {open ? "Verberg de tekst" : "Toon de tekst"}
      </button>
      {open && (
        <div id={`${id}-t`} className="verse-text-body" aria-live="polite">
          {state === "loading" && <p className="hint">Tekst laden…</p>}
          {state === "error" && <p className="hint">De tekst is nu niet te laden. Zonder internet lukt het alleen als deze vertaling offline staat.</p>}
          {verses && verses.length === 0 && <p className="hint">Van deze verzen is geen tekst ingeladen.</p>}
          {verses && verses.length > 0 && (
            <p>
              {verses.map((v) => (
                <span key={`${v.chapter}:${v.verse}`}>
                  <sup>{multi ? `${v.chapter}:${v.verse}` : v.verse}</sup> {v.text}{" "}
                </span>
              ))}
            </p>
          )}
          {passage.endChapter - passage.startChapter >= MAX_CHAPTERS && <p className="hint">Alleen de eerste {MAX_CHAPTERS} hoofdstukken; lees verder in de Bijbel.</p>}
        </div>
      )}
    </div>
  );
}
