/**
 * IndexedDB storage for offline writing (BK-025, BK-029, BK-033; spec §14).
 * The document and the outbox are written in ONE transaction, before "Lokaal opgeslagen" is shown.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Note } from "@bk/schemas";
import { queueChange } from "./outbox";
import type { ConflictRecord, LocalContent, OutboxEntry, PendingChange, StoredNote } from "./types";

export type BookInfo = { code: string; name: string; chapterCount: number };
export type Meta = {
  deviceId: string;
  userId: string | null;
  cursor: string | null;
  lastSyncAt: number | null;
  recentLimit: number;
  books: BookInfo[];
  defaultTranslation: string;
  /** what the server has: per note its last change, version and archive state */
  index: Record<string, { updatedAt: string; version: number; archived: boolean; title: string }>;
};

interface Schema extends DBSchema {
  notes: { key: string; value: StoredNote };
  outbox: { key: string; value: OutboxEntry };
  conflicts: { key: string; value: ConflictRecord };
  meta: { key: string; value: unknown };
}

const DB_NAME = "bijbelkompas";
/** Version 1. A schema change needs a new version with an upgrade step (and a test). */
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbPromise) {
    dbPromise = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore("notes", { keyPath: "id" });
          d.createObjectStore("outbox", { keyPath: "noteId" });
          d.createObjectStore("conflicts", { keyPath: "id" });
          d.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the open connection. */
export function resetDbForTests() {
  dbPromise = null;
}

const DEFAULT_META: Meta = {
  deviceId: "",
  userId: null,
  cursor: null,
  lastSyncAt: null,
  recentLimit: 30,
  books: [],
  defaultTranslation: "SV",
  index: {},
};

export async function getMeta(): Promise<Meta> {
  const d = await db();
  const stored = (await d.get("meta", "meta")) as Partial<Meta> | undefined;
  return { ...DEFAULT_META, ...stored };
}

export async function setMeta(patch: Partial<Meta>): Promise<Meta> {
  const d = await db();
  const tx = d.transaction("meta", "readwrite");
  const current = { ...DEFAULT_META, ...((await tx.store.get("meta")) as Partial<Meta> | undefined) };
  const next = { ...current, ...patch };
  await tx.store.put(next, "meta");
  await tx.done;
  return next;
}

/** A stable id for this browser, created once. */
export async function deviceId(): Promise<string> {
  const m = await getMeta();
  if (m.deviceId) return m.deviceId;
  return (await setMeta({ deviceId: crypto.randomUUID() })).deviceId;
}

export function contentOf(note: Note): LocalContent {
  return { title: note.title, noteType: note.noteType, eventDate: note.eventDate, sermon: note.sermon, document: note.document };
}

export async function getStored(id: string): Promise<StoredNote | undefined> {
  return (await db()).get("notes", id);
}

export async function listStored(): Promise<StoredNote[]> {
  return (await db()).getAll("notes");
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  return (await db()).getAll("outbox");
}

export async function listConflicts(): Promise<ConflictRecord[]> {
  return (await db()).getAll("conflicts");
}

/**
 * Remembers the server copy of a note the writer opened (offline available from now on).
 * Unsynced local content is never replaced.
 */
export async function rememberServerNote(note: Note): Promise<StoredNote> {
  const d = await db();
  const tx = d.transaction("notes", "readwrite");
  const prev = await tx.store.get(note.id);
  // Unsynced text keeps its base version: moving the base forward would let a later save silently
  // overwrite a change made elsewhere. The server then answers "conflict" and the writer chooses.
  const keepServer = Boolean(prev?.local) || Boolean(prev?.server && prev.server.documentVersion > note.documentVersion);
  const next: StoredNote = {
    id: note.id,
    server: keepServer ? prev!.server : note,
    local: prev?.local ?? null,
    localUpdatedAt: prev?.localUpdatedAt ?? null,
    pinned: prev?.pinned ?? false,
    openedAt: Date.now(),
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}

/** Saves what was typed and queues it for the server, atomically. */
export async function saveLocal(
  noteId: string,
  change: PendingChange,
  opts: { createdLocally?: boolean } = {},
): Promise<void> {
  const d = await db();
  const tx = d.transaction(["notes", "outbox"], "readwrite");
  const notes = tx.objectStore("notes");
  const outbox = tx.objectStore("outbox");
  const now = Date.now();
  const prev = await notes.get(noteId);
  await notes.put({
    id: noteId,
    server: prev?.server ?? null,
    local: change.content,
    localUpdatedAt: now,
    pinned: prev?.pinned ?? false,
    openedAt: prev?.openedAt ?? now,
  });
  const entry = await outbox.get(noteId);
  await outbox.put(queueChange(entry, noteId, change, { createdLocally: opts.createdLocally ?? (!prev?.server && !entry), now }));
  await tx.done;
}

export async function setPinned(noteId: string, pinned: boolean): Promise<void> {
  const d = await db();
  const tx = d.transaction("notes", "readwrite");
  const prev = await tx.store.get(noteId);
  if (prev) await tx.store.put({ ...prev, pinned });
  await tx.done;
}

/** Rough storage use for the sync page (BK-033). */
export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
}

/** Wipes everything stored in this browser. Only used when nothing is waiting to be sent. */
export async function wipeAll(): Promise<void> {
  const d = await db();
  const tx = d.transaction(["notes", "outbox", "conflicts", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("notes").clear(),
    tx.objectStore("outbox").clear(),
    tx.objectStore("conflicts").clear(),
    tx.objectStore("meta").clear(),
  ]);
  await tx.done;
}
