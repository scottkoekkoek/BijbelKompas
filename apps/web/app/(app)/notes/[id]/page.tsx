import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoteSuggestions } from "@/components/ai/NoteSuggestions";
import { NoteCollections } from "@/components/collections/NoteCollections";
import { ArchiveButton } from "@/components/notes/ArchiveButton";
import { ClockIcon } from "@/components/icons";
import { LocalNote } from "@/components/notes/LocalNote";
import { configuredProvider } from "@/lib/ai/provider";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { collectionsOfNote, listCollections, questionsOfNote } from "@/lib/collections/data";
import { buildTree, flatten } from "@/lib/collections/tree";
import { getNote, getSermonSuggestions } from "@/lib/notes/data";
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
  const [books, translations, suggestions, collections, memberOf, questions, prefs] = await Promise.all([
    getBooks(supabase),
    getTranslations(supabase),
    getSermonSuggestions(supabase),
    listCollections(supabase),
    collectionsOfNote(supabase, note.id),
    questionsOfNote(supabase, note.id),
    supabase.from("user_preferences").select("ai_enabled").maybeSingle(),
  ]);
  const provider = configuredProvider();
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
      <LocalNote
        key={note.id}
        note={note}
        books={books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount }))}
        defaultTranslation={translation?.code ?? "SV"}
        suggestions={suggestions}
      />
      <div className="note-footer">
        <Link className="button ghost small" href={`/notes/${note.id}/versies`}>
          <ClockIcon size={16} />
          Versiegeschiedenis
        </Link>
        <ArchiveButton id={note.id} archived={note.archived} />
      </div>
      <NoteCollections
        noteId={note.id}
        collections={flatten(buildTree(collections)).map(({ id, name, depth }) => ({ id, name, depth }))}
        memberOf={memberOf}
        questions={questions}
      />
      <NoteSuggestions
        noteId={note.id}
        aiEnabled={prefs.data?.ai_enabled === true}
        provider={provider ? { name: provider.name, external: provider.external } : null}
      />
    </article>
  );
}
