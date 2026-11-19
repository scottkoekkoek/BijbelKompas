import "fake-indexeddb/auto";
import { EMPTY_SERMON, type Note } from "@bk/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  DB_VERSION,
  getBibleChapter,
  getMeta,
  getStored,
  listOutbox,
  rememberServerNote,
  removeBibleTranslation,
  resetDbForTests,
  saveBibleBook,
  saveLocal,
  storedChapters,
  wipeAll,
} from "./db";
import type { LocalContent } from "./types";
import { noteFromStored } from "./view";

const ID = "22222222-2222-4222-8222-222222222222";
const doc = (t: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const server = (version: number, text: string): Note => ({
  id: ID,
  title: "Preek",
  noteType: "preek",
  status: "concept",
  eventDate: null,
  documentVersion: version,
  currentRevision: 0,
  archived: false,
  updatedAt: "2026-11-16T10:00:00Z",
  document: doc(text),
  sermon: EMPTY_SERMON,
});
const local = (t: string): LocalContent => ({ title: "Preek", noteType: "preek", eventDate: null, sermon: EMPTY_SERMON, document: doc(t) });

beforeEach(async () => {
  resetDbForTests();
  await wipeAll();
});

describe("offline storage", () => {
  it("stores the text and queues it in one step (BK-025)", async () => {
    await rememberServerNote(server(3, "server"));
    await saveLocal(ID, { content: local("offline getypt"), baseVersion: 3 });
    const [stored, outbox] = await Promise.all([getStored(ID), listOutbox()]);
    expect(stored?.local?.document).toEqual(doc("offline getypt"));
    expect(outbox).toMatchObject([{ noteId: ID, base: 3, createdLocally: false, pending: { content: local("offline getypt") } }]);
  });

  it("a newer server copy never replaces unsynced text or its base", async () => {
    await rememberServerNote(server(3, "server"));
    await saveLocal(ID, { content: local("mijn tekst"), baseVersion: 3 });
    const after = await rememberServerNote(server(5, "van een ander apparaat"));
    expect(after.local?.document).toEqual(doc("mijn tekst"));
    expect(after.server?.documentVersion).toBe(3);
    const shown = noteFromStored(after, (await listOutbox())[0]);
    expect(shown).toMatchObject({ documentVersion: 3, document: doc("mijn tekst") });
  });

  it("a note made offline is marked as new", async () => {
    await saveLocal(ID, { content: local("nieuw") }, { createdLocally: true });
    expect((await listOutbox())[0]).toMatchObject({ createdLocally: true, base: null });
    expect(noteFromStored((await getStored(ID))!)).toMatchObject({ id: ID, documentVersion: 0, status: "concept" });
  });

  it("wiping leaves nothing behind (safe logout)", async () => {
    await saveLocal(ID, { content: local("x") }, { createdLocally: true });
    await wipeAll();
    expect(await listOutbox()).toEqual([]);
    expect(await getStored(ID)).toBeUndefined();
  });
});

describe("Bible offline (BK-014)", () => {
  const T = { code: "TEST", name: "Testvertaling (fictief)", attribution: null };
  const chapters = [
    { chapter: 1, verses: [{ verse: 1, text: "[TESTTEKST] een" }, { verse: 2, text: "[TESTTEKST] twee" }] },
    { chapter: 2, verses: [{ verse: 1, text: "[TESTTEKST] drie" }] },
  ];

  it("keeps chapters per translation and removes them again", async () => {
    await saveBibleBook(T, "GEN", chapters);
    await saveBibleBook(T, "OBA", []); // a book without text is not listed
    expect((await getMeta()).offlineBible.TEST).toMatchObject({ books: ["GEN"], chapters: 2 });
    expect((await getBibleChapter("TEST", "GEN", 1))?.verses).toHaveLength(2);
    expect(await storedChapters("TEST", "GEN")).toEqual([1, 2]);
    await removeBibleTranslation("TEST");
    expect(await getBibleChapter("TEST", "GEN", 1)).toBeUndefined();
    expect((await getMeta()).offlineBible).toEqual({});
  });

  it("upgrades a version 1 database without losing notes", async () => {
    await db();
    resetDbForTests();
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase("bijbelkompas");
      del.onsuccess = () => resolve();
      del.onerror = () => reject(del.error);
    });
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("bijbelkompas", 1);
      open.onupgradeneeded = () => {
        const d = open.result;
        d.createObjectStore("notes", { keyPath: "id" }).put({ id: ID, server: null, local: local("van voor de update"), localUpdatedAt: 1, pinned: false, openedAt: 1 });
        d.createObjectStore("outbox", { keyPath: "noteId" });
        d.createObjectStore("conflicts", { keyPath: "id" });
        d.createObjectStore("meta");
      };
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => reject(open.error);
    });
    expect((await getStored(ID))?.local?.document).toEqual(doc("van voor de update"));
    expect((await db()).version).toBe(DB_VERSION);
    await saveBibleBook(T, "GEN", chapters);
    expect(await storedChapters("TEST", "GEN")).toEqual([1, 2]);
  });
});
