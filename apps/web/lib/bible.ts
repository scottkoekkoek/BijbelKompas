/** Pure helpers for the Bible reader (BK-009, BK-012). No data access here. */

export type BookRef = { code: string; name: string; chapterCount: number };
export type Selection = { from: number; to: number } | null;

/** Tap logic: first tap selects a verse, a second tap extends to a range, a tap inside clears. */
export function nextSelection(current: Selection, verse: number): Selection {
  if (!current) return { from: verse, to: verse };
  if (verse >= current.from && verse <= current.to) return null;
  if (current.from === current.to) {
    return verse < current.from ? { from: verse, to: current.from } : { from: current.from, to: verse };
  }
  return { from: verse, to: verse };
}

/** "Johannes 3:16" or "Johannes 3:16-18" (with translation code when given). */
export function formatReference(bookName: string, chapter: number, selection: Selection, translation?: string): string {
  const base = !selection
    ? `${bookName} ${chapter}`
    : selection.from === selection.to
      ? `${bookName} ${chapter}:${selection.from}`
      : `${bookName} ${chapter}:${selection.from}-${selection.to}`;
  return translation ? `${base} (${translation})` : base;
}

/** Previous and next chapter, crossing into the neighbouring book. */
export function neighbours(
  books: BookRef[],
  code: string,
  chapter: number,
): { prev: { book: BookRef; chapter: number } | null; next: { book: BookRef; chapter: number } | null } {
  const i = books.findIndex((b) => b.code === code);
  if (i < 0) return { prev: null, next: null };
  const book = books[i]!;
  const prevBook = books[i - 1];
  const nextBook = books[i + 1];
  const prev = chapter > 1 ? { book, chapter: chapter - 1 } : prevBook ? { book: prevBook, chapter: prevBook.chapterCount } : null;
  const next = chapter < book.chapterCount ? { book, chapter: chapter + 1 } : nextBook ? { book: nextBook, chapter: 1 } : null;
  return { prev, next };
}

/** Case- and accent-insensitive book filter ("joh" finds Johannes, 1 Johannes ...). */
export function filterBooks<T extends { name: string }>(books: T[], query: string): T[] {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, "");
  const q = norm(query);
  return q ? books.filter((b) => norm(b.name).includes(q)) : books;
}

export function readerPath(book: string, chapter: number, translation?: string): string {
  return `/bible/${book}/${chapter}${translation ? `?v=${translation}` : ""}`;
}

export type PassageTarget = {
  book: string;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  translation?: string;
};

/**
 * Audit BK-01: the one place that builds a link to a passage. It opens the start chapter at the
 * exact verse (or range), marks it, and can carry the note to return to. A whole chapter
 * (verse 1 to 999) stays a plain chapter link. A range that runs into the next chapter is marked
 * up to the end of the start chapter.
 */
export function passagePath(p: PassageTarget, back?: string): string {
  const base = readerPath(p.book, p.startChapter, p.translation);
  const params: string[] = [];
  const whole = p.startVerse <= 1 && p.endVerse >= 999;
  if (!whole) {
    const to = p.endChapter === p.startChapter ? Math.max(p.endVerse, p.startVerse) : 999;
    params.push(`vers=${p.startVerse}${to !== p.startVerse ? `-${to}` : ""}`);
  }
  if (back && isBackPath(back)) params.push(`terug=${encodeURIComponent(back)}`);
  const query = params.length ? `${base.includes("?") ? "&" : "?"}${params.join("&")}` : "";
  return `${base}${query}${whole ? "" : `#v${p.startVerse}`}`;
}

/** Only a note page, or its sermon view, can be a way back (no open redirects). */
export function isBackPath(path: string | undefined): path is string {
  return !!path && /^\/notes\/[0-9a-f-]{36}(\/preek)?$/.test(path);
}

/** Reads "16" or "16-18" from the reader's ?vers= parameter. */
export function parseVerseTarget(raw: string | undefined): { from: number; to: number } | null {
  const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(raw ?? "");
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  return from >= 1 && to >= from ? { from, to } : null;
}
