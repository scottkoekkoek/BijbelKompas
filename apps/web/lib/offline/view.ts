/** Turns what this browser stored into the note the editor shows (BK-025). Pure. */
import type { Note } from "@bk/schemas";
import type { OutboxEntry, StoredNote } from "./types";

/**
 * Local text wins over the server copy, and the version stays the one that local text builds on,
 * so a change made elsewhere comes back as a conflict. Null when there is nothing to show.
 */
export function noteFromStored(s: StoredNote, entry?: OutboxEntry): Note | null {
  if (!s.local) return s.server;
  const base = entry?.base ?? s.server?.documentVersion ?? 0;
  const status = entry?.pending?.status ?? entry?.sent?.status ?? s.server?.status ?? "concept";
  return {
    id: s.id,
    currentRevision: s.server?.currentRevision ?? 0,
    archived: s.server?.archived ?? false,
    updatedAt: new Date(s.localUpdatedAt ?? Date.now()).toISOString(),
    ...s.local,
    status,
    documentVersion: base,
  };
}
