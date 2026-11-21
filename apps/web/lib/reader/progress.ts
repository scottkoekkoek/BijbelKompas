import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { chapterStatus, type ChapterStatus } from "./progress-status";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Feature 6 (ADR-015): personal reading progress. Kept per canonical verse, so it is the same in
 * every translation. Only these functions read it, and only reading_mark changes it; the database
 * limits everything to the signed-in owner.
 */
export type ChapterProgress = { chapter: number; total: number; read: number; status: ChapterStatus };

export async function bookChapters(db: Db, book: string): Promise<ChapterProgress[]> {
  const { data, error } = await db.rpc("reading_chapters", { p_book: book });
  if (error) throw error;
  return ((data ?? []) as { chapter: number; total: number; read: number }[]).map((r) => ({ ...r, status: chapterStatus(r.total, r.read) }));
}

/** Per book code: chapters read completely and chapters started. Books without progress are left out. */
export async function booksProgress(db: Db): Promise<Record<string, { read: number; started: number }>> {
  const { data, error } = await db.rpc("reading_books");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { book_code: string; chapters_read: number; chapters_started: number }[]).map((r) => [r.book_code, { read: r.chapters_read, started: r.chapters_started }]));
}

/** The first verse not read yet (in a book, or in one chapter); null when everything is read. */
export async function nextUnread(db: Db, book: string, chapter?: number): Promise<{ chapter: number; verse: number } | null> {
  const { data, error } = await db.rpc("reading_next", { p_book: book, p_chapter: chapter ?? null });
  if (error) throw error;
  return ((data ?? []) as { chapter: number; verse: number }[])[0] ?? null;
}

/** The verse numbers of a chapter that are read, in this translation's numbering. */
export async function readVerses(db: Db, translation: string, book: string, chapter: number): Promise<number[]> {
  const { data, error } = await db.rpc("reading_verses", { p_translation: translation, p_book: book, p_chapter: chapter });
  if (error) throw error;
  return ((data ?? []) as { verse: number }[]).map((r) => r.verse);
}
