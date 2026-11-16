import type { Note, NoteDocument, NoteStatus, NoteSummary, NoteType, RevisionReason, SermonDetails, SyncOperation } from "@bk/schemas";

/** What the writer typed: the full editable content of a note. */
export type LocalContent = {
  title: string;
  noteType: NoteType;
  eventDate: string | null;
  sermon: SermonDetails;
  document: NoteDocument;
};

export type SaveReason = Exclude<RevisionReason, "herstel">;

/** A note kept in this browser (IndexedDB "notes" store). */
export type StoredNote = {
  id: string;
  /** last known server state; null = created on this device and not on the server yet */
  server: Note | null;
  /** unsynced local content; null = identical to server */
  local: LocalContent | null;
  localUpdatedAt: number | null;
  pinned: boolean;
  openedAt: number;
};

/** `baseVersion`: the server version the editor's text was built on (used when a new entry starts). */
export type PendingChange = { content: LocalContent; reason?: SaveReason; status?: NoteStatus; baseVersion?: number | null };

/**
 * Outbox per note. `sent` was handed to the network and is retried with the SAME operation id until
 * the server answers; `pending` collects newer edits and becomes the next operation afterwards.
 */
export type OutboxEntry = {
  noteId: string;
  createdLocally: boolean;
  /**
   * The server version this device's text builds on. A save is sent with this as its base, so a
   * change made elsewhere in the meantime always comes back as a conflict, never as an overwrite.
   */
  base: number | null;
  sent: SyncOperation | null;
  pending: PendingChange | null;
  queuedAt: number;
  blocked: null | "conflict" | "rejected";
  message?: string;
};

export type ConflictRecord = {
  id: string;
  noteId: string;
  copyNoteId: string;
  title: string;
  at: number;
  resolved: boolean;
};

export type NoteEvent =
  | { type: "synced"; note: NoteSummary; op: SyncOperation; stillPending: boolean }
  | { type: "conflict"; current: NoteSummary | null }
  | { type: "rejected"; message: string };

export type { Note };
