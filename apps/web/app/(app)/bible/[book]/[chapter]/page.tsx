import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompareView } from "@/components/bible/CompareView";
import { HighlightList } from "@/components/bible/HighlightList";
import { VerseList } from "@/components/bible/VerseList";
import { ChevronLeftIcon, ChevronRightIcon, CompareIcon, ExternalIcon } from "@/components/icons";
import { configuredProvider } from "@/lib/ai/provider";
import { isBackPath, neighbours, parseVerseTarget, readerPath } from "@/lib/bible";
import { getBooks, getChapter, getTranslations, pickTranslation } from "@/lib/bible-data";
import { ChapterProgress } from "@/components/bible/ChapterProgress";
import { chapterHighlights, compareChapter } from "@/lib/reader/data";
import { bookChapters, nextUnread, readVerses } from "@/lib/reader/progress";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ book: string; chapter: string }>; searchParams: Promise<{ v?: string; naast?: string; vers?: string; terug?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { book, chapter } = await params;
  const supabase = await createClient();
  const found = (await getBooks(supabase)).find((b) => b.code === book.toUpperCase());
  return { title: found ? `${found.name} ${chapter}` : "Bijbel" };
}

export default async function ReaderPage({ params, searchParams }: Props) {
  const { book: rawBook, chapter: rawChapter } = await params;
  const { v, naast, vers, terug } = await searchParams;
  // audit BK-01: the exact verse a link pointed at, and the note to return to
  const target = parseVerseTarget(vers);
  const back = isBackPath(terug) ? terug : null;
  const chapter = Number(rawChapter);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const [books, translations, prefs] = await Promise.all([
    getBooks(supabase),
    getTranslations(supabase),
    supabase.from("user_preferences").select("default_translation_id, ai_enabled").eq("user_id", auth.user?.id ?? "").maybeSingle(),
  ]);
  const book = books.find((b) => b.code === rawBook.toUpperCase());
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapterCount) notFound();

  const translation = pickTranslation(translations, v?.toUpperCase(), prefs.data?.default_translation_id ?? null);
  const data = translation ? await getChapter(supabase, translation, book, chapter) : null;
  const { prev, next } = neighbours(books, book.code, chapter);
  const { data: chapterNotes } = data
    ? await supabase.rpc("notes_for_chapter", { p_translation: data.translation.code, p_book: book.code, p_chapter: chapter })
    : { data: null };
  // BK-050: research questions linked to verses of this chapter
  const { data: chapterQuestions } = data
    ? await supabase.rpc("passage_questions", { p_translation: data.translation.code, p_book: book.code, p_chapter: chapter, p_start_verse: 1, p_end_verse: 999 })
    : { data: null };
  const questions = (chapterQuestions ?? []) as { question_id: string; title: string; label: string }[];
  const noteRows = (chapterNotes ?? []) as { verse_number: number; note_id: string; title: string }[];
  const backNote = back ? (await supabase.from("notes").select("title").eq("id", back.split("/")[2]!).maybeSingle()).data : null;
  const lastVerse = data?.verses.at(-1)?.verse ?? 0;
  const targetMissing = !!target && !!data && data.verses.length > 0 && target.from > lastVerse;
  const notesInChapter = [...new Map(noteRows.map((r) => [r.note_id, r])).values()];
  const references = translations.filter((t) => !t.hasText && t.externalUrl);
  const readable = translations.filter((t) => t.hasText);
  // BK-011: a second translation side by side (only one whose text may be shown)
  const other = translation && naast ? readable.find((t) => t.code === naast.toUpperCase() && t.code !== translation.code) : undefined;
  const compared = data && other && data.verses.length > 0 ? await compareChapter(supabase, data.translation.code, other.code, book.code, chapter) : null;
  // BK-013: the owner's highlights, in the numbering of this translation
  const highlights = data ? await chapterHighlights(supabase, data.translation.code, book.code, chapter) : [];
  // feature 6: what the owner marked as read; reading this page changes nothing
  const hasText = !!data && data.verses.length > 0;
  const [readList, chapters, firstUnread] = hasText
    ? await Promise.all([readVerses(supabase, data.translation.code, book.code, chapter), bookChapters(supabase, book.code), nextUnread(supabase, book.code, chapter)])
    : [[], [], null];
  const progress = chapters.find((c) => c.chapter === chapter);
  // ADR-017: AI-uitleg only with AI on, a provider, and a translation that may go to AI
  const provider = configuredProvider();
  const explainWith = provider && prefs.data?.ai_enabled === true && translation?.aiAllowed ? { name: provider.name, external: provider.external } : null;
  const comparePath = (code: string) => `${readerPath(book.code, chapter, translation?.code)}&naast=${code}`;

  return (
    <article className="reader">
      <p className="crumb">
        <Link href="/bible">Alle boeken</Link> · <Link href={`/bible/${book.code}${translation ? `?v=${translation.code}` : ""}`}>{book.name}</Link>
        {back && backNote && (
          <Link className="reader-back" href={back}>
            <ChevronLeftIcon /> {back.endsWith("/preek") ? "Terug naar de preek" : `Terug naar ${backNote.title || "je notitie"}`}
          </Link>
        )}
      </p>
      <header className="reader-head">
        <h1>
          {book.name} {chapter}
        </h1>
        <div className="reader-step" aria-label="Hoofdstuk wisselen" role="group">
          {prev ? (
            <Link className="icon-button" href={readerPath(prev.book.code, prev.chapter, translation?.code)} aria-label="Vorig hoofdstuk" title={`${prev.book.name} ${prev.chapter}`}>
              <ChevronLeftIcon size={20} />
            </Link>
          ) : (
            <span className="icon-button" aria-hidden="true" data-disabled="true">
              <ChevronLeftIcon size={20} />
            </span>
          )}
          {next ? (
            <Link className="icon-button" href={readerPath(next.book.code, next.chapter, translation?.code)} aria-label="Volgend hoofdstuk" title={`${next.book.name} ${next.chapter}`}>
              <ChevronRightIcon size={20} />
            </Link>
          ) : (
            <span className="icon-button" aria-hidden="true" data-disabled="true">
              <ChevronRightIcon size={20} />
            </span>
          )}
        </div>
      </header>

      <div className="reader-tools">
        <nav aria-label="Vertaling" className="translation-switch">
          <span className="segmented">
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
          </span>
          {references.length > 0 && (
            <span className="external-translations">
              {references.map((t) => (
                <a key={t.code} href={t.externalUrl!} target="_blank" rel="noopener noreferrer" title={`${t.name} (externe website)`}>
                  {t.code}
                  <ExternalIcon />
                  <span className="visually-hidden"> (opent externe website)</span>
                </a>
              ))}
            </span>
          )}
        </nav>
        {translation && readable.length > 1 && (
          <nav aria-label="Vergelijk met" className="translation-switch compare-switch">
            <span className="compare-label">
              <CompareIcon />
              <span>Vergelijk</span>
            </span>
            {readable
              .filter((t) => t.code !== translation.code)
              .map((t) => (
                <Link key={t.code} href={comparePath(t.code)} aria-current={t.code === other?.code ? "true" : undefined} title={`Vergelijk met ${t.name}`}>
                  {t.code}
                </Link>
              ))}
            {other && (
              <Link className="compare-close" href={readerPath(book.code, chapter, translation.code)}>
                Vergelijken sluiten
              </Link>
            )}
          </nav>
        )}
      </div>

      {targetMissing && (
        <p className="alert info target-missing" role="status">
          {book.name} {chapter} heeft in de {data?.translation.name} {lastVerse} verzen. Vers {target?.from} bestaat hier niet; het hele hoofdstuk wordt getoond.
        </p>
      )}

      {!data ? (
        <p className="placeholder">Er is nog geen vertaling met tekst beschikbaar.</p>
      ) : data.verses.length === 0 ? (
        <p className="placeholder">
          Van {book.name} {chapter} is in de {data.translation.name} nog geen tekst ingeladen.
        </p>
      ) : compared && other ? (
        <CompareView
          rows={compared}
          caption={`${book.name} ${chapter} in ${data.translation.name} en ${other.name}`}
          a={{ code: data.translation.code, name: data.translation.name }}
          b={{ code: other.code, name: other.name }}
        />
      ) : (
        <VerseList
          key={`${data.translation.code}-${book.code}-${chapter}`}
          verses={data.verses}
          bookCode={book.code}
          bookName={book.name}
          chapter={chapter}
          translationCode={data.translation.code}
          noted={[...new Set(noteRows.map((r) => r.verse_number))]}
          highlights={highlights}
          target={targetMissing ? null : target}
          read={readList}
          explainWith={explainWith}
        />
      )}

      {!compared && <HighlightList highlights={highlights} />}

      {(notesInChapter.length > 0 || questions.length > 0) && (
        <div className="chapter-links">
          {notesInChapter.length > 0 && (
            <section className="chapter-notes" aria-labelledby="chapter-notes-title">
              <h2 id="chapter-notes-title">
                Notities bij dit hoofdstuk <span className="count" aria-hidden="true">{notesInChapter.length}</span>
              </h2>
              <ul className="chip-list">
                {notesInChapter.map((n) => {
                  const verses = [...new Set(noteRows.filter((r) => r.note_id === n.note_id).map((r) => r.verse_number))].sort((x, y) => x - y);
                  return (
                    <li key={n.note_id}>
                      <Link className="link-chip" href={`/notes/${n.note_id}`}>
                        <span className="link-chip-title">{n.title || "Naamloze notitie"}</span>
                        <span className="link-chip-meta">{verses.length === 1 ? `vers ${verses[0]}` : `verzen ${verses.join(", ")}`}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {questions.length > 0 && (
            <section className="chapter-notes" aria-labelledby="chapter-questions-title">
              <h2 id="chapter-questions-title">
                Vragen bij dit hoofdstuk <span className="count" aria-hidden="true">{questions.length}</span>
              </h2>
              <ul className="chip-list">
                {questions.map((q) => (
                  <li key={q.question_id}>
                    <Link className="link-chip" href={`/questions/${q.question_id}`}>
                      <span className="link-chip-title">{q.title}</span>
                      <span className="link-chip-meta">{q.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {hasText && progress && (
        <ChapterProgress
          translation={data.translation.code}
          book={book.code}
          bookName={book.name}
          chapter={chapter}
          status={progress.status}
          read={progress.read}
          total={progress.total}
          nextVerse={firstUnread?.verse ?? null}
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
