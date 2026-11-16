import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readerPath } from "@/lib/bible";
import { getBooks } from "@/lib/bible-data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ book: string }>; searchParams: Promise<{ v?: string }> };

async function load(code: string) {
  const supabase = await createClient();
  const books = await getBooks(supabase);
  return books.find((b) => b.code === code.toUpperCase()) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const book = await load((await params).book);
  return { title: book ? book.name : "Bijbel" };
}

export default async function BookPage({ params, searchParams }: Props) {
  const book = await load((await params).book);
  if (!book) notFound();
  const { v } = await searchParams;

  return (
    <>
      <p className="crumb">
        <Link href="/bible">Alle boeken</Link>
      </p>
      <h1>{book.name}</h1>
      <p className="page-intro">Kies een hoofdstuk.</p>
      <ol className="chapter-grid" aria-label={`Hoofdstukken van ${book.name}`}>
        {Array.from({ length: book.chapterCount }, (_, i) => i + 1).map((n) => (
          <li key={n}>
            <Link href={readerPath(book.code, n, v)} aria-label={`${book.name} ${n}`}>
              {n}
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
