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
