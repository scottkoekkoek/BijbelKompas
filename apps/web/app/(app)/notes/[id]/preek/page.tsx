// Feature 4: the reading view of a finished sermon. Read-only: nothing here writes to the note,
// its status or its versions. The font size lives on this device only.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentView } from "@/components/notes/DocumentView";
import { SermonView, type SermonPassage } from "@/components/sermon/SermonView";
import { passagePath } from "@/lib/bible";
import { getBooks, getChapter, getTranslations } from "@/lib/bible-data";
import { getNote } from "@/lib/notes/data";
import { canOpenSermonView, inPassage, notePassages, passageChapters } from "@/lib/notes/sermon";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

async function load(rawId: string) {
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return null;
  const supabase = await createClient();
  return { supabase, note: await getNote(supabase, id.data) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).id);
  return { title: r?.note ? `Preekweergave: ${r.note.title || "Naamloze preek"}` : "Preekweergave" };
}

export default async function SermonPage({ params }: Props) {
  const r = await load((await params).id);
  if (!r?.note) notFound();
  const { supabase, note } = r;
  const notePath = `/notes/${note.id}`;

  if (!canOpenSermonView(note)) {
    return (
      <article className="sermon-blocked">
        <p className="crumb">
          <Link href={notePath}>Terug naar notitie</Link>
        </p>
        <h1>Preekweergave</h1>
        <p className="alert info">
          {note.noteType !== "preek"
            ? "De preekweergave is er alleen voor notities van het type Preek."
            : "De preekweergave opent zodra de preek is afgerond. Rond de notitie eerst af in de editor."}
        </p>
      </article>
    );
  }

  const back = `${notePath}/preek`;
  const [books, translations] = await Promise.all([getBooks(supabase), getTranslations(supabase)]);
  const chapters = new Map<string, Promise<{ verse: number; text: string }[]>>();
  const chapterText = (t: (typeof translations)[number], book: (typeof books)[number], chapter: number) => {
    const key = `${t.code}.${book.code}.${chapter}`;
    if (!chapters.has(key)) chapters.set(key, getChapter(supabase, t, book, chapter).then((c) => c.verses).catch(() => []));
    return chapters.get(key)!;
  };

  const passages: SermonPassage[] = await Promise.all(
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

  const meta = [
    note.eventDate ? dateFmt.format(new Date(`${note.eventDate}T00:00:00Z`)) : null,
    note.sermon.speaker,
    note.sermon.organization,
    note.sermon.serviceType,
    note.sermon.series ? `Serie: ${note.sermon.series}` : null,
  ].filter((x): x is string => !!x);

  return (
    <SermonView noteId={note.id} title={note.title || "Naamloze preek"} meta={meta} passages={passages}>
      <DocumentView doc={note.document} back={back} className="note-body readonly sermon-text" />
    </SermonView>
  );
}
