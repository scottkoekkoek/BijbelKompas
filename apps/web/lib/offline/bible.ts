/**
 * BK-014: keep the text of an allowed translation on this device (ADR-010). Only translations the
 * server lists as offline-allowed are ever fetched; HSV/NBV21 are reference-only and never stored.
 */
import { getMeta, removeBibleTranslation, saveBibleBook, type BookInfo } from "./db";

export type OfflineAllowed = { code: string; name: string; attribution: string | null };

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw Object.assign(new Error(`http ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

export async function allowedOffline(): Promise<OfflineAllowed[]> {
  return (await get<{ translations: OfflineAllowed[] }>("/api/v1/bible/offline")).translations;
}

/** Downloads every book (one request per book) and stores each book as soon as it arrives. */
export async function downloadTranslation(t: OfflineAllowed, books: BookInfo[], onProgress: (done: number, total: number) => void): Promise<void> {
  await removeBibleTranslation(t.code); // start clean, so the chapter count is right
  for (const [i, b] of books.entries()) {
    const r = await get<{ chapters: { chapter: number; verses: { verse: number; text: string }[] }[] }>(
      `/api/v1/bible/offline?translation=${encodeURIComponent(t.code)}&book=${encodeURIComponent(b.code)}`,
    );
    await saveBibleBook(t, b.code, r.chapters);
    onProgress(i + 1, books.length);
  }
}

/** Removes stored translations that may no longer be kept offline (rights changed, licence ended). */
export async function pruneOfflineBible(allowed: string[]): Promise<string[]> {
  const meta = await getMeta();
  const gone = Object.keys(meta.offlineBible).filter((code) => !allowed.includes(code));
  for (const code of gone) await removeBibleTranslation(code);
  return gone;
}
