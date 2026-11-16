import type { Metadata } from "next";
import Link from "next/link";
import { BookPicker } from "@/components/bible/BookPicker";
import { readerPath } from "@/lib/bible";
import { getBooks, getReadingPosition } from "@/lib/bible-data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bijbel" };

export default async function BiblePage() {
  const supabase = await createClient();
  const [books, position] = await Promise.all([getBooks(supabase), getReadingPosition(supabase)]);

  return (
    <>
      <h1>Bijbel</h1>
      {position && (
        <p className="continue">
          <Link className="button" href={readerPath(position.bookCode, position.chapter, position.translation)}>
            Verder lezen: {position.bookName} {position.chapter}
          </Link>
        </p>
      )}
      <BookPicker books={books} />
    </>
  );
}
