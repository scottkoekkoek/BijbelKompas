"use client";
/**
 * BK-025/029: opens a note from the server, but shows this browser's newer, unsynced text when there
 * is any. Opening a note also makes it available offline.
 */
import type { Note } from "@bk/schemas";
import { useEffect, useState } from "react";
import { PinToggle } from "@/components/sync/PinToggle";
import { getStored, listOutbox, rememberServerNote } from "@/lib/offline/db";
import type { BookInfo } from "@/lib/notes/reference";
import { noteFromStored } from "@/lib/offline/view";
import { NoteEditor, type Suggestions } from "./NoteEditor";

type Props = { note: Note; books: BookInfo[]; defaultTranslation: string; suggestions: Suggestions };
type Loaded = { note: Note; unsynced: boolean; stamp: number | null; stored: boolean };

/** Combines the server copy with local text (the version stays the one the local text builds on). */
export async function loadLocalFirst(serverNote: Note): Promise<Loaded> {
  const stored = await rememberServerNote(serverNote);
  const entry = stored.local ? (await listOutbox()).find((e) => e.noteId === serverNote.id) : undefined;
  return {
    note: noteFromStored(stored, entry) ?? serverNote,
    unsynced: Boolean(stored.local),
    stamp: stored.localUpdatedAt,
    stored: true,
  };
}

export function LocalNote(props: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let alive = true;
    loadLocalFirst(props.note)
      .catch(async () => {
        // no storage in this browser (blocked or full): edit straight against the server
        const s = await getStored(props.note.id).catch(() => undefined);
        return { note: props.note, unsynced: false, stamp: s?.localUpdatedAt ?? null, stored: false };
      })
      .then((l) => alive && setLoaded(l));
    return () => {
      alive = false;
    };
  }, [props.note]);

  if (!loaded) return <p className="muted" role="status">Notitie openen…</p>;
  return (
    <>
      <NoteEditor
        key={props.note.id}
        note={loaded.note}
        unsynced={loaded.unsynced}
        localStamp={loaded.stamp}
        books={props.books}
        defaultTranslation={props.defaultTranslation}
        suggestions={props.suggestions}
      />
      {loaded.stored && (
        <p className="pin-row">
          <PinToggle noteId={props.note.id} />
        </p>
      )}
    </>
  );
}
