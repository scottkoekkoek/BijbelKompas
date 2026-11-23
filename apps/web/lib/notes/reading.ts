import "server-only";
// Ronde 3, §2: what the reading view of a finished note needs. Reads only: nothing here writes to
// the note, its status or its versions. Shared by sermons and every other note type.
import type { Note } from "@bk/schemas";
import type { SermonPassage } from "@/components/sermon/SermonView";
import { passagePath } from "@/lib/bible";
import { getBooks, getChapter, getTranslations } from "@/lib/bible-data";
import type { createClient } from "@/lib/supabase/server";
import { inPassage, notePassages, passageChapters } from "./sermon";

type Db = Awaited<ReturnType<typeof createClient>>;

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The Bible passages of the note with their text (only translations whose text may be shown). */
export async function readingPassages(db: Db, note: Note, back: string): Promise<SermonPassage[]> {
  const [books, translations] = await Promise.all([getBooks(db), getTranslations(db)]);
  const chapters = new Map<string, Promise<{ verse: number; text: string }[]>>();
  const chapterText = (t: (typeof translations)[number], book: (typeof books)[number], chapter: number) => {
    const key = `${t.code}.${book.code}.${chapter}`;
    if (!chapters.has(key)) chapters.set(key, getChapter(db, t, book, chapter).then((c) => c.verses).catch(() => []));
    return chapters.get(key)!;
  };
  return Promise.all(
    notePassages(note.document).map(async (p, i) => {
      const t = translations.find((x) => x.code === p.translation);
      const book = books.find((b) => b.code === p.book);
      const base = {
        key: String(i),
        label: p.label,
        translation: t?.code ?? p.translation,
        translationName: t?.name ?? p.translation,
        href: passagePath(p, back),
        externalUrl: t && !t.hasText ? t.externalUrl : null,
        attribution: t?.hasText ? t.attribution : null,
      };
      // HSV/NBV21: reference and external link only, never text (afspraak 2)
      if (!t?.hasText || !book) return { ...base, verses: null };
      const list = passageChapters(p).filter((c) => c <= book.chapterCount);
      const texts = await Promise.all(list.map((c) => chapterText(t, book, c)));
      const verses = list.flatMap((c, j) => texts[j]!.filter((v) => inPassage(p, c, v.verse)).map((v) => ({ chapter: c, ...v })));
      return { ...base, verses, cut: p.endChapter > list.at(-1)! };
    }),
  );
}

/** Date, and for a sermon the speaker, church, service and series. */
export function readingMeta(note: Note): string[] {
  return [
    note.eventDate ? dateFmt.format(new Date(`${note.eventDate}T00:00:00Z`)) : null,
    note.sermon.speaker,
    note.sermon.organization,
    note.sermon.serviceType,
    note.sermon.series ? `Serie: ${note.sermon.series}` : null,
  ].filter((x): x is string => !!x);
}
