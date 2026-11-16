import "fake-indexeddb/auto";
import { EMPTY_SERMON, type Note } from "@bk/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { getStored, listOutbox, rememberServerNote, resetDbForTests, saveLocal, wipeAll } from "./db";
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
