import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { passagePath, readerPath } from "@/lib/bible";
import { getBooks } from "@/lib/bible-data";
import { bookChapters, nextUnread } from "@/lib/reader/progress";
import { bookProgressText, CHAPTER_STATUS_LABELS } from "@/lib/reader/progress-status";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ book: string }>; searchParams: Promise<{ v?: string }> };

async function load(code: string) {
  const supabase = await createClient();
  const books = await getBooks(supabase);
  return { supabase, book: books.find((b) => b.code === code.toUpperCase()) ?? null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { book } = await load((await params).book);
  return { title: book ? book.name : "Bijbel" };
}

export default async function BookPage({ params, searchParams }: Props) {
  const { supabase, book } = await load((await params).book);
  if (!book) notFound();
  const { v } = await searchParams;
  // feature 6: only explicit marks count; opening a chapter changes nothing
  const [chapters, next] = await Promise.all([bookChapters(supabase, book.code), nextUnread(supabase, book.code)]);
  const status = new Map(chapters.map((c) => [c.chapter, c.status]));
  const readCount = chapters.filter((c) => c.status === "gelezen").length;

  return (
    <>
      <p className="crumb">
        <Link href="/bible">Alle boeken</Link>
      </p>
      <h1>{book.name}</h1>
      <section className="book-progress" aria-label="Leesvoortgang">
        <p className="book-progress-count">{bookProgressText(book.name, readCount, book.chapterCount)}</p>
        {next ? (
          <Link
            className="button secondary"
            href={passagePath({ book: book.code, startChapter: next.chapter, startVerse: next.verse, endChapter: next.chapter, endVerse: next.verse, translation: v })}
          >
            Naar eerstvolgende ongelezen vers
            <span className="muted"> ({book.name} {next.chapter}:{next.verse})</span>
          </Link>
        ) : (
          <p className="alert ok book-complete">Je hebt {book.name} helemaal gelezen.</p>
        )}
      </section>
      <p className="page-intro">Kies een hoofdstuk.</p>
      <ol className="chapter-grid with-progress" aria-label={`Hoofdstukken van ${book.name}`}>
        {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => {
          const s = status.get(n) ?? "ongelezen";
          return (
            <li key={n}>
              <Link href={readerPath(book.code, n, v)} className={`chapter-tile ${s}`} aria-label={`${book.name} ${n}`} aria-describedby={`hst-${n}`}>
                <span className="chapter-tile-number">{n}</span>
                <span className="chapter-tile-status" id={`hst-${n}`}>
                  {CHAPTER_STATUS_LABELS[s]}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}
