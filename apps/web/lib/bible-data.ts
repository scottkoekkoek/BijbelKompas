import "server-only";
import type { BibleBook, ChapterResponse } from "@bk/schemas";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type ReaderTranslation = {
  id: string;
  code: string;
  name: string;
  rightsStatus: "public_domain" | "licensed" | "reference_only" | "test_fixture";
  attribution: string | null;
  externalUrl: string | null;
  hasText: boolean;
};

/** Translations whose text may be shown (RLS already hides disabled ones). */
const TEXT_ALLOWED = new Set(["public_domain", "licensed", "test_fixture"]);

export async function getBooks(db: Db): Promise<BibleBook[]> {
  const { data, error } = await db
    .from("bible_books")
    .select("book_code, book_order, name, testament, chapter_count, bible_canons!inner(code)")
    .eq("bible_canons.code", "PROT66")
    .order("book_order");
  if (error) throw error;
  return (data ?? []).map((b) => ({
    code: b.book_code,
    order: b.book_order,
    name: b.name,
    testament: b.testament,
    chapterCount: b.chapter_count,
  }));
}

export async function getTranslations(db: Db): Promise<ReaderTranslation[]> {
  const { data, error } = await db
    .from("bible_translations")
    .select("id, code, name, rights_status, attribution, external_url")
    .order("code");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    rightsStatus: t.rights_status,
    attribution: t.attribution,
    externalUrl: t.external_url,
    hasText: TEXT_ALLOWED.has(t.rights_status),
  }));
}

/**
 * Which translation to show: the one asked for, else the user's default, else the
 * Statenvertaling, else any translation with text (locally: the fictitious test text).
 */
export function pickTranslation(
  translations: ReaderTranslation[],
  requested: string | undefined,
  defaultId: string | null,
): ReaderTranslation | null {
  const readable = translations.filter((t) => t.hasText);
  return (
    readable.find((t) => t.code === requested) ??
    readable.find((t) => t.id === defaultId) ??
    readable.find((t) => t.code === "SV") ??
    readable[0] ??
    null
  );
}

export async function getChapter(
  db: Db,
  translation: ReaderTranslation,
  book: BibleBook,
  chapter: number,
): Promise<ChapterResponse> {
  const prefix = `${book.code}.${chapter}.`;
  const { data, error } = await db
    .from("translation_segments")
    .select("segment_key, text")
    .eq("translation_id", translation.id)
    .like("segment_key", `${prefix}%`)
    .order("display_order")
    .limit(500);
  if (error) throw error;
  return {
    translation: { code: translation.code, name: translation.name, attribution: translation.attribution },
    book,
    chapter,
    verses: (data ?? [])
      .map((s) => ({ verse: Number(s.segment_key.slice(prefix.length)), text: s.text }))
      .filter((v) => Number.isInteger(v.verse) && v.verse > 0),
  };
}

export async function getReadingPosition(db: Db) {
  const { data } = await db
    .from("reading_positions")
    .select("chapter_number, bible_books!inner(book_code, name), bible_translations!inner(code)")
    .maybeSingle();
  if (!data) return null;
  const book = data.bible_books as unknown as { book_code: string; name: string };
  const tr = data.bible_translations as unknown as { code: string };
  return { bookCode: book.book_code, bookName: book.name, chapter: data.chapter_number, translation: tr.code };
}
