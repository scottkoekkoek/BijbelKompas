import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArchiveButton } from "@/components/notes/ArchiveButton";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { getNote } from "@/lib/notes/data";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };

async function load(rawId: string) {
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return null;
  const supabase = await createClient();
  return { supabase, note: await getNote(supabase, id.data) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).id);
  return { title: r?.note?.title || "Notitie" };
}

export default async function NotePage({ params }: Props) {
  const r = await load((await params).id);
  if (!r?.note) notFound();
  const { supabase, note } = r;
  const [books, translations] = await Promise.all([getBooks(supabase), getTranslations(supabase)]);
  const translation = pickTranslation(translations, undefined, null);

  return (
    <article className="note-page">
      <p className="crumb">
        <Link href={note.archived ? "/notes?archief=1" : "/notes"}>{note.archived ? "Archief" : "Notities"}</Link>
      </p>
      {note.archived && (
        <p className="alert ok">Deze notitie staat in het archief. Je kunt hem nog steeds lezen en bewerken.</p>
      )}
      <h1 className="visually-hidden">{note.title || "Naamloze notitie"}</h1>
      <NoteEditor
        key={note.id}
        note={note}
        books={books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount }))}
        defaultTranslation={translation?.code ?? "SV"}
      />
      <div className="button-row note-footer">
        <Link className="button secondary" href={`/notes/${note.id}/versies`}>
          Versiegeschiedenis
        </Link>
        <ArchiveButton id={note.id} archived={note.archived} />
      </div>
    </article>
  );
}
