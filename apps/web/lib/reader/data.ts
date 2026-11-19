import "server-only";
import type { ChapterHighlight, CompareRow, HighlightColor, HighlightCreate, HighlightPatch } from "@bk/schemas";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** "GEN.1.3" -> "1:3" */
export function keyLabel(key: string): string {
  const [, c, v] = key.split(".");
  return `${c}:${v}`;
}

/** BK-011 / AT-09: chapter of translation a, with the text of translation b for the same canonical verses. */
export async function compareChapter(db: Db, a: string, b: string, book: string, chapter: number): Promise<CompareRow[]> {
  const { data, error } = await db.rpc("compare_chapter", { p_a: a, p_b: b, p_book: book, p_chapter: chapter });
  if (error) throw error;
  const prefix = `${book}.${chapter}.`;
  return ((data ?? []) as { a_key: string; a_text: string; b_keys: string[]; b_texts: string[]; uncertain: boolean }[])
    .map((r) => ({
      verse: Number(r.a_key.slice(prefix.length)),
      text: r.a_text,
      otherVerses: r.b_keys.map(keyLabel),
      otherTexts: r.b_texts,
      uncertain: r.uncertain,
    }))
    .filter((r) => Number.isInteger(r.verse) && r.verse > 0);
}

/** BK-013: the owner's highlights touching a chapter, in that translation's verse numbers. */
export async function chapterHighlights(db: Db, translation: string, book: string, chapter: number): Promise<ChapterHighlight[]> {
  const { data, error } = await db.rpc("chapter_highlights", { p_translation: translation, p_book: book, p_chapter: chapter });
  if (error) throw error;
  return ((data ?? []) as { id: string; label: string; color: HighlightColor; annotation: string; verses: number[] }[]).map((h) => ({
    id: h.id,
    label: h.label,
    color: h.color,
    annotation: h.annotation,
    verses: h.verses,
  }));
}

export async function addHighlight(db: Db, input: HighlightCreate): Promise<{ id: string }> {
  const { data, error } = await db
    .rpc("add_highlight", { p_passage: { ...input.passage, label: input.label }, p_color: input.color, p_annotation: input.annotation })
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

/** false when the highlight does not exist (or is someone else's: RLS). */
export async function updateHighlight(db: Db, id: string, patch: HighlightPatch): Promise<boolean> {
  const { data, error } = await db.from("highlights").update(patch).eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function removeHighlight(db: Db, id: string): Promise<boolean> {
  const { data, error } = await db.rpc("remove_highlight", { p_id: id });
  if (error) throw error;
  return data === true;
}

export const isInvalidHighlight = (err: unknown) => ["22023", "23514", "22P02"].includes((err as { code?: string })?.code ?? "");
