// Ronde 3 §2: the reading view of a finished note (every type; a sermon shows its details too).
// Reads only: opening, reading or going back changes nothing about the note, its status or versions.
import { NOTE_TYPE_LABELS, type Note } from "@bk/schemas";
import { LinkedSummary } from "@/components/ai/LinkedSummary";
import { NoteOutline } from "@/components/ai/NoteOutline";
import { NoteSuggestions } from "@/components/ai/NoteSuggestions";
import { NoteCollections } from "@/components/collections/NoteCollections";
import { DocumentView } from "@/components/notes/DocumentView";
import { BackCrumb } from "@/components/reading/BackCrumb";
import { LocalChangesNotice } from "@/components/reading/LocalChangesNotice";
import { SermonView } from "@/components/sermon/SermonView";
import { getNoteSummary } from "@/lib/ai/data";
import { configuredProvider } from "@/lib/ai/provider";
import { collectionsOfNote, listCollections, questionsOfNote } from "@/lib/collections/data";
import { buildTree, flatten } from "@/lib/collections/tree";
import { readingMeta, readingPassages } from "@/lib/notes/reading";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function NoteReading({ supabase, note }: { supabase: Db; note: Note }) {
  const here = `/notes/${note.id}`;
  const editHref = `${here}?bewerken=1`;
  const [passages, prefs, collections, memberOf, questions, summary] = await Promise.all([
    readingPassages(supabase, note, here),
    supabase.from("user_preferences").select("ai_enabled").maybeSingle(),
    listCollections(supabase),
    collectionsOfNote(supabase, note.id),
    questionsOfNote(supabase, note.id),
    getNoteSummary(supabase, note.id),
  ]);
  const p = configuredProvider();
  const provider = p ? { name: p.name, external: p.external } : null;
  const aiEnabled = prefs.data?.ai_enabled === true;
  const list = note.archived ? "/notes?archief=1" : "/notes";

  return (
    <SermonView
      noteId={note.id}
      title={note.title || "Naamloze notitie"}
      eyebrow={`${NOTE_TYPE_LABELS[note.noteType]} · Afgerond${note.archived ? " · In het archief" : ""}`}
      meta={readingMeta(note)}
      passages={passages}
      editHref={editHref}
      crumb={<BackCrumb fallback={list} label={note.archived ? "Archief" : "Notities"} />}
      notice={<LocalChangesNotice noteId={note.id} editHref={editHref} />}
      after={
        <div className="reading-panels">
          {summary && <LinkedSummary summary={summary} />}
          <NoteOutline
            noteId={note.id}
            title={note.title}
            noteType={note.noteType}
            aiEnabled={aiEnabled}
            provider={provider}
            hasSaved={summary !== null}
            savedOutlineId={summary?.outlineId ?? null}
          />
          <NoteCollections
            noteId={note.id}
            collections={flatten(buildTree(collections)).map(({ id, name, depth }) => ({ id, name, depth }))}
            memberOf={memberOf}
            questions={questions}
          />
          <NoteSuggestions noteId={note.id} aiEnabled={aiEnabled} provider={provider} />
        </div>
      }
    >
      <DocumentView doc={note.document} back={here} className="note-body readonly sermon-text" />
    </SermonView>
  );
}
