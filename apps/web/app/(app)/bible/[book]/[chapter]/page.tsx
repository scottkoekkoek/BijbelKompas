import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VerseList } from "@/components/bible/VerseList";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { neighbours, readerPath } from "@/lib/bible";
import { getBooks, getChapter, getTranslations, pickTranslation } from "@/lib/bible-data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ book: string; chapter: string }>; searchParams: Promise<{ v?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { book, chapter } = await params;
  const supabase = await createClient();
  const found = (await getBooks(supabase)).find((b) => b.code === book.toUpperCase());
  return { title: found ? `${found.name} ${chapter}` : "Bijbel" };
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { book: rawBook, chapter: rawChapter } = await params;
  const { v } = await searchParams;
  const chapter = Number(rawChapter);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [books, translations, prefs] = await Promise.all([
    getBooks(supabase),
    getTranslations(supabase),
    supabase.from("user_preferences").select("default_translation_id").eq("user_id", auth.user?.id ?? "").maybeSingle(),
  ]);
  const book = books.find((b) => b.code === rawBook.toUpperCase());
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) notFound();

  const translation = pickTranslation(translations, v?.toUpperCase(), prefs.data?.default_translation_id ?? null);
  const data = translation ? await getChapter(supabase, translation, book, chapter) : null;
  const { prev, next } = neighbours(books, book.code, chapter);
  const references = translations.filter((t) => !t.hasText && t.externalUrl);
  const readable = translations.filter((t) => t.hasText);

  return (
    <article className="reader">
      <p className="crumb">
        <Link href="/bible">Alle boeken</Link> · <Link href={`/bible/${book.code}${translation ? `?v=${translation.code}` : ""}`}>{book.name}</Link>
      </p>
      <header className="reader-head">
        <h1>
          {book.name} {chapter}
        </h1>
        <nav aria-label="Vertaling" className="translation-switch">
          {readable.map((t) => (
            <Link
              key={t.code}
              href={readerPath(book.code, chapter, t.code)}
              aria-current={t.code === translation?.code ? "true" : undefined}
              title={t.name}
            >
              {t.code}
            </Link>
          ))}
          {references.map((t) => (
            <a key={t.code} href={t.externalUrl!} target="_blank" rel="noopener noreferrer" title={`${t.name} (externe website)`}>
              {t.code}
              <span aria-hidden="true"> ↗</span>
              <span className="visually-hidden"> (opent externe website)</span>
            </a>
          ))}
        </nav>
      </header>

      {!data ? (
        <p className="placeholder">Er is nog geen vertaling met tekst beschikbaar.</p>
      ) : data.verses.length === 0 ? (
        <p className="placeholder">
          Van {book.name} {chapter} is in de {data.translation.name} nog geen tekst ingeladen.
        </p>
      ) : (
        <VerseList
          key={`${data.translation.code}-${book.code}-${chapter}`}
          verses={data.verses}
          bookCode={book.code}
          bookName={book.name}
          chapter={chapter}
          translationCode={data.translation.code}
        />
      )}

      <nav className="chapter-nav" aria-label="Hoofdstukken">
        {prev ? (
          <Link className="button secondary" href={readerPath(prev.book.code, prev.chapter, translation?.code)} rel="prev">
            <ChevronLeftIcon /> {prev.book.name} {prev.chapter}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link className="button secondary" href={readerPath(next.book.code, next.chapter, translation?.code)} rel="next">
            {next.book.name} {next.chapter} <ChevronRightIcon />
          </Link>
        )}
      </nav>
      {data?.translation.attribution && <p className="attribution">{data.translation.attribution}</p>}
    </article>
  );
}
