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
  /** Sprint 7: collections kept offline, with the notes in them (and in their subcollections) */
  pinnedCollections: Record<string, { name: string; noteIds: string[] }>;
  /** Sprint 9 (BK-014): Bible translations kept on this device, with the books that have text */
  offlineBible: Record<string, OfflineTranslation>;
};

export type OfflineTranslation = { name: string; attribution: string | null; books: string[]; chapters: number; savedAt: number };
export type StoredChapter = { key: string; translation: string; book: string; chapter: number; verses: { verse: number; text: string }[] };
export const chapterKey = (translation: string, book: string, chapter: number) => `${translation}/${book}/${chapter}`;

interface Schema extends DBSchema {
  notes: { key: string; value: StoredNote };
  outbox: { key: string; value: OutboxEntry };
  conflicts: { key: string; value: ConflictRecord };
  meta: { key: string; value: unknown };
  bible: { key: string; value: StoredChapter; indexes: { translation: string } };
}

const DB_NAME = "bijbelkompas";
/** Version 2 (Sprint 9) adds the Bible store. A schema change needs a new version with an upgrade step (and a test). */
export const DB_VERSION = 2;

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
        if (oldVersion < 2) {
          d.createObjectStore("bible", { keyPath: "key" }).createIndex("translation", "translation");
        }
      },
      // a newer version of the app (another tab) wants to upgrade: step aside, the next call reopens
      blocking() {
        void dbPromise?.then((d) => d.close());
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

/** For tests: forget the open connection. */
export function resetDbForTests() {
  void dbPromise?.then((d) => d.close());
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
  pinnedCollections: {},
  offlineBible: {},
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

/** Sprint 7: keep a collection offline (its notes are fetched on the next sync), or stop doing so. */
export async function setCollectionPinned(id: string, pin: { name: string; noteIds: string[] } | null): Promise<void> {
  const d = await db();
  const tx = d.transaction("meta", "readwrite");
  const current = { ...DEFAULT_META, ...((await tx.store.get("meta")) as Partial<Meta> | undefined) };
  const pinnedCollections = { ...current.pinnedCollections };
  if (pin) pinnedCollections[id] = pin;
  else delete pinnedCollections[id];
  await tx.store.put({ ...current, pinnedCollections }, "meta");
  await tx.done;
}

/** BK-014: stores the chapters of one book and records it under the translation, in one step. */
export async function saveBibleBook(
  translation: { code: string; name: string; attribution: string | null },
  book: string,
  chapters: { chapter: number; verses: { verse: number; text: string }[] }[],
): Promise<void> {
  const d = await db();
  const tx = d.transaction(["bible", "meta"], "readwrite");
  const store = tx.objectStore("bible");
  for (const c of chapters) {
    await store.put({ key: chapterKey(translation.code, book, c.chapter), translation: translation.code, book, chapter: c.chapter, verses: c.verses });
  }
  const meta = tx.objectStore("meta");
  const current = { ...DEFAULT_META, ...((await meta.get("meta")) as Partial<Meta> | undefined) };
  const prev = current.offlineBible[translation.code];
  const books = chapters.length > 0 ? [...new Set([...(prev?.books ?? []), book])] : (prev?.books ?? []);
  const entry: OfflineTranslation = {
    name: translation.name,
    attribution: translation.attribution,
    books,
    chapters: (prev?.chapters ?? 0) + chapters.length,
    savedAt: Date.now(),
  };
  await meta.put({ ...current, offlineBible: { ...current.offlineBible, [translation.code]: entry } }, "meta");
  await tx.done;
}

export async function getBibleChapter(translation: string, book: string, chapter: number): Promise<StoredChapter | undefined> {
  return (await db()).get("bible", chapterKey(translation, book, chapter));
}

/** The chapter numbers of a book that are on this device. */
export async function storedChapters(translation: string, book: string): Promise<number[]> {
  const all = await (await db()).getAllKeysFromIndex("bible", "translation", translation);
  const prefix = `${translation}/${book}/`;
  return all
    .map(String)
    .filter((k) => k.startsWith(prefix))
    .map((k) => Number(k.slice(prefix.length)))
    .sort((a, b) => a - b);
}

/** Removes a translation's text from this device. */
export async function removeBibleTranslation(code: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["bible", "meta"], "readwrite");
  const store = tx.objectStore("bible");
  for (const key of await store.index("translation").getAllKeys(code)) await store.delete(key);
  const meta = tx.objectStore("meta");
  const current = { ...DEFAULT_META, ...((await meta.get("meta")) as Partial<Meta> | undefined) };
  const offlineBible = { ...current.offlineBible };
  delete offlineBible[code];
  await meta.put({ ...current, offlineBible }, "meta");
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
  const tx = d.transaction(["notes", "outbox", "conflicts", "meta", "bible"], "readwrite");
  await Promise.all([
    tx.objectStore("bible").clear(),
    tx.objectStore("notes").clear(),
    tx.objectStore("outbox").clear(),
    tx.objectStore("conflicts").clear(),
    tx.objectStore("meta").clear(),
  ]);
  await tx.done;
}
