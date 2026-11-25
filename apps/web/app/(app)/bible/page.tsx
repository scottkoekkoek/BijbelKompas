import type { Metadata } from "next";
import Link from "next/link";
import { BookPicker } from "@/components/bible/BookPicker";
import { resumePath } from "@/lib/bible";
import { getBooks, getReadingPosition } from "@/lib/bible-data";
import { booksProgress } from "@/lib/reader/progress";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bijbel" };

export default async function BiblePage() {
  const supabase = await createClient();
  const [books, position, progress] = await Promise.all([getBooks(supabase), getReadingPosition(supabase), booksProgress(supabase)]);

  return (
    <>
      <h1>Bijbel</h1>
      <p className="continue">
        {position && (
          <Link className="button" href={resumePath(position.bookCode, position.chapter, position.translation, position.verse)}>
            Verder lezen: {position.bookName} {position.chapter}
            {position.verse && position.verse > 1 ? `:${position.verse}` : ""}
          </Link>
        )}{" "}
        <Link className="button secondary" href="/leesplan">Leesplan</Link>
      </p>
      <BookPicker books={books} progress={progress} />
    </>
  );
}
