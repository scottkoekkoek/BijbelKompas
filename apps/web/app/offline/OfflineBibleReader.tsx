"use client";
/**
 * BK-014: reading a Bible translation that was kept on this device, without internet.
 * path: "TEST" (books), "TEST/GEN" (chapters) or "TEST/GEN/1" (text). A path without translation
 * ("GEN/1", from the service worker) uses the default translation if it is here, else the first one.
 */
import { useEffect, useState } from "react";
import { getBibleChapter, getMeta, storedChapters, type BookInfo, type Meta, type StoredChapter } from "@/lib/offline/db";

type Props = { path: string; onNavigate: (path: string | null) => void };
type View =
  | { kind: "missing" }
  | { kind: "books"; code: string; meta: Meta }
  | { kind: "chapters"; code: string; book: BookInfo; chapters: number[]; meta: Meta }
  | { kind: "text"; code: string; book: BookInfo; chapter: StoredChapter; chapters: number[]; meta: Meta };

export function parseBiblePath(path: string, meta: Meta): { code: string; book?: string; chapter?: number } | null {
  const parts = path.split("/").filter(Boolean).map((p) => p.toUpperCase());
  const codes = Object.keys(meta.offlineBible);
  if (codes.length === 0) return null;
  const isBook = (s: string | undefined) => !!s && meta.books.some((b) => b.code === s);
  let code: string;
  if (parts[0] && meta.offlineBible[parts[0]] && !isBook(parts[0])) code = parts.shift()!;
  else if (parts[0] && !isBook(parts[0]) && !/^\d+$/.test(parts[0])) return null; // a translation that is not here
  else code = meta.offlineBible[meta.defaultTranslation] ? meta.defaultTranslation : codes[0]!;
  const book = parts[0];
  const chapter = parts[1] ? Number(parts[1]) : undefined;
  return { code, book, chapter: Number.isInteger(chapter) ? chapter : undefined };
}

export function OfflineBibleReader({ path, onNavigate }: Props) {
  const [view, setView] = useState<View | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const meta = await getMeta();
      const p = parseBiblePath(path, meta);
      let next: View = { kind: "missing" };
      if (p) {
        const book = meta.books.find((b) => b.code === p.book);
        if (!p.book) next = { kind: "books", code: p.code, meta };
        else if (book) {
          const chapters = await storedChapters(p.code, book.code);
          const chapter = p.chapter ? await getBibleChapter(p.code, book.code, p.chapter) : undefined;
          if (chapter) next = { kind: "text", code: p.code, book, chapter, chapters, meta };
          else if (!p.chapter && chapters.length > 0) next = { kind: "chapters", code: p.code, book, chapters, meta };
        }
      }
      if (alive) setView(next);
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  if (!view) return <p role="status">Laden…</p>;
  if (view.kind === "missing") {
    return (
      <>
        <h1>Niet op dit apparaat</h1>
        <p className="alert error">Deze Bijbeltekst staat niet op dit apparaat. Je kunt een vertaling die offline mag bewaren via Offline en synchronisatie, als je weer internet hebt.</p>
        <button type="button" className="button secondary" onClick={() => onNavigate(null)}>Terug naar offline</button>
      </>
    );
  }
  const t = view.meta.offlineBible[view.code]!;
  const books = view.meta.books.filter((b) => t.books.includes(b.code));

  if (view.kind === "books") {
    return (
      <>
        <p className="crumb">
          <button type="button" className="link-button" onClick={() => onNavigate(null)}>Offline</button>
        </p>
        <h1>{t.name}</h1>
        <ul className="offline-list">
          {books.map((b) => (
            <li key={b.code}>
              <button type="button" onClick={() => onNavigate(`${view.code}/${b.code}`)}>
                <span className="title">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (view.kind === "chapters") {
    return (
      <>
        <p className="crumb">
          <button type="button" className="link-button" onClick={() => onNavigate(view.code)}>{t.name}</button>
        </p>
        <h1>{view.book.name}</h1>
        <nav aria-label="Hoofdstukken" className="chapter-grid">
          {view.chapters.map((c) => (
            <button key={c} type="button" onClick={() => onNavigate(`${view.code}/${view.book.code}/${c}`)}>
              {c}
            </button>
          ))}
        </nav>
      </>
    );
  }

  const i = view.chapters.indexOf(view.chapter.chapter);
  const prev = view.chapters[i - 1];
  const next = view.chapters[i + 1];
  return (
    <article className="reader">
      <p className="crumb">
        <button type="button" className="link-button" onClick={() => onNavigate(view.code)}>{t.name}</button>
        {" · "}
        <button type="button" className="link-button" onClick={() => onNavigate(`${view.code}/${view.book.code}`)}>{view.book.name}</button>
      </p>
      <h1>
        {view.book.name} {view.chapter.chapter} <span className="muted">({view.code}, offline)</span>
      </h1>
      <div className="bible-text">
        {view.chapter.verses.map((v) => (
          <span key={v.verse} id={`v${v.verse}`} className="verse">
            <sup className="compare-ref">{v.verse}</sup> <span>{v.text}</span>{" "}
          </span>
        ))}
      </div>
      <nav className="chapter-nav" aria-label="Hoofdstukken">
        {prev ? (
          <button type="button" className="button secondary" onClick={() => onNavigate(`${view.code}/${view.book.code}/${prev}`)}>
            ‹ {view.book.name} {prev}
          </button>
        ) : (
          <span />
        )}
        {next && (
          <button type="button" className="button secondary" onClick={() => onNavigate(`${view.code}/${view.book.code}/${next}`)}>
            {view.book.name} {next} ›
          </button>
        )}
      </nav>
      {t.attribution && <p className="attribution">{t.attribution}</p>}
    </article>
  );
}
