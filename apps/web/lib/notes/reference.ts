/** Parsing typed Bible references such as "Joh 3:16-18" (BK-017 reference block). Pure. */
import { formatReference } from "@/lib/bible";

export type BookInfo = { code: string; name: string; chapterCount: number };
export type ParsedRef = {
  book: BookInfo;
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
  label: string;
};

const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[\s.]+/g, "");

/** Finds a book by (abbreviated) name: "joh" → Johannes, "1 joh" → 1 Johannes, "ps" → Psalmen. */
export function findBook(books: BookInfo[], query: string): BookInfo | null {
  const q = norm(query);
  if (!q) return null;
  return books.find((b) => norm(b.name) === q) ?? books.find((b) => norm(b.name).startsWith(q)) ?? null;
}

/** All books a typed name could mean: one when it is exact or unique, more when it is ambiguous ("Jo"). */
export function bookCandidates(books: BookInfo[], query: string): BookInfo[] {
  const q = norm(query);
  if (!q) return [];
  const exact = books.filter((b) => norm(b.name) === q);
  return exact.length > 0 ? exact : books.filter((b) => norm(b.name).startsWith(q));
}

/**
 * Audit BK-02: a search term that is a Bible reference. Returns every reading when the book name
 * is ambiguous, an error when it is a reference with impossible numbers, or null when it is just a word.
 */
export function referenceInSearch(input: string, books: BookInfo[]): { refs: ParsedRef[] } | { error: string } | null {
  const m = REF.exec(input.replace(/[\u2013\u2014]/g, "-"));
  if (!m) return null;
  const candidates = bookCandidates(books, m[1]!);
  if (candidates.length === 0) return null;
  const rest = input.replace(/[\u2013\u2014]/g, "-").slice(m[1]!.length);
  const parsed = candidates.slice(0, 6).map((b) => parseReference(`${b.name} ${rest}`, [b]));
  const refs = parsed.filter((p): p is ParsedRef => !("error" in p));
  if (refs.length > 0) return { refs };
  return { error: (parsed[0] as { error: string }).error };
}

const REF = /^\s*((?:[1-3]\s*)?[^\d:]+?)\s*(\d{1,3})(?:\s*:\s*(\d{1,3}))?(?:\s*-\s*(\d{1,3})(?:\s*:\s*(\d{1,3}))?)?\s*$/u;

/**
 * Accepts "Johannes 3", "Joh 3:16", "Joh 3:16-18", "Joh 3:16-4:2" and "Ps 23-24".
 * A whole chapter is stored as verse 1 to 999 and resolved by the database.
 */
export function parseReference(input: string, books: BookInfo[]): ParsedRef | { error: string } {
  const m = REF.exec(input.replace(/[\u2013\u2014]/g, "-"));
  if (!m) return { error: "Schrijf de verwijzing als bijvoorbeeld “Joh 3:16-18”." };
  const [, bookPart, c1, v1, x, y] = m;
  const book = findBook(books, bookPart!);
  if (!book) return { error: `Bijbelboek “${bookPart!.trim()}” niet gevonden.` };

  const startChapter = Number(c1);
  let startVerse: number;
  let endChapter: number;
  let endVerse: number;
  if (v1 === undefined) {
    // "Ps 23" or "Ps 23-24": whole chapters
    startVerse = 1;
    endChapter = x !== undefined && y === undefined ? Number(x) : startChapter;
    endVerse = 999;
    if (y !== undefined) return { error: "Schrijf de verwijzing als bijvoorbeeld “Joh 3:16-18”." };
  } else {
    startVerse = Number(v1);
    if (x === undefined) {
      endChapter = startChapter;
      endVerse = startVerse;
    } else if (y === undefined) {
      endChapter = startChapter;
      endVerse = Number(x);
    } else {
      endChapter = Number(x);
      endVerse = Number(y);
    }
  }
  if (startChapter < 1 || endChapter > book.chapterCount || startChapter > book.chapterCount) {
    return { error: `${book.name} heeft ${book.chapterCount} hoofdstuk${book.chapterCount === 1 ? "" : "ken"}.` };
  }
  if (startVerse < 1 || endChapter < startChapter || (endChapter === startChapter && endVerse < startVerse)) {
    return { error: "Het einde van de verwijzing ligt vóór het begin." };
  }
  return { book, startChapter, startVerse, endChapter, endVerse, label: refLabel(book.name, startChapter, startVerse, endChapter, endVerse) };
}

export function refLabel(bookName: string, sc: number, sv: number, ec: number, ev: number): string {
  if (sv === 1 && ev >= 999) return sc === ec ? `${bookName} ${sc}` : `${bookName} ${sc}-${ec}`;
  if (sc === ec) return formatReference(bookName, sc, { from: sv, to: ev });
  return `${bookName} ${sc}:${sv}-${ec}:${ev}`;
}

/** Ronde 4 (A2): a reference found inside running text, with every book it could mean. */
export type FoundReference = { text: string; start: number; end: number; refs: ParsedRef[] };

// Short Dutch words that would otherwise be read as a book name ("de 10:30" is a time, not Deuteronomium).
const NOT_A_BOOK = new Set(["de", "het", "een", "en", "op", "om", "in", "is", "of", "te", "tot", "van", "voor", "na", "ja", "nee", "ik", "je", "we", "u", "al", "at", "rond", "vanaf"]);
const IN_TEXT = /(^|[^\p{L}\d])((?:[1-3]\s?)?\p{L}[\p{L}.]{1,20})\s?(\d{1,3})\s?:\s?(\d{1,3})(?:\s?-\s?(\d{1,3})(?:\s?:\s?(\d{1,3}))?)?(?![\d:])/gu;

/**
 * Finds references written as "boek hoofdstuk:vers" in running text, e.g. "zie Rom 8:28" or
 * "Joh 15:5-8". Only with a verse, so a plain "Ik 3" or a time ("om 10:30") is never a reference.
 * An ambiguous name ("Jo 2:1") gives every possible book, so the writer can choose.
 */
export function findReferences(text: string, books: BookInfo[], max = 10): FoundReference[] {
  const found: FoundReference[] = [];
  for (const m of text.replace(/[–—]/g, "-").matchAll(IN_TEXT)) {
    const [, lead, name, c, v, x, y] = m;
    const word = name!.replace(/\.$/, "");
    if (NOT_A_BOOK.has(word.toLowerCase())) continue;
    const rest = `${c}:${v}${x ? `-${x}${y ? `:${y}` : ""}` : ""}`;
    const parsed = referenceInSearch(`${word} ${rest}`, books);
    if (!parsed || "error" in parsed) continue;
    const start = m.index! + lead!.length;
    found.push({ text: m[0].slice(lead!.length), start, end: m.index! + m[0].length, refs: parsed.refs.slice(0, 3) });
    if (found.length >= max) break;
  }
  return found;
}
