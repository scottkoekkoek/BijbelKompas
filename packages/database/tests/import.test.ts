// Sprint 8: putting an export back (AT-15). Only adds; never changes what is there; never crosses accounts.
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

async function fails(q: pg.Client, sql: string, params: unknown[] = []): Promise<string> {
  await q.query("savepoint s");
  try {
    await q.query(sql, params);
  } catch (e) {
    await q.query("rollback to savepoint s");
    return (e as { code?: string }).code ?? "unknown";
  }
  throw new Error(`expected an error: ${sql}`);
}
const asUser = (q: pg.Client, id: string) =>
  q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);

function exported(id = randomUUID()) {
  const block = randomUUID();
  const document = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: block }, content: [{ type: "text", text: "Uit de export." }] }] };
  return {
    note: { id, title: "Teruggezet", noteType: "preek", status: "afgerond", eventDate: "2024-05-12", createdAt: "2024-05-12T09:00:00Z", completedAt: "2024-05-12T12:00:00Z", archivedAt: null, document },
    blocks: [{ block_id: block, block_type: "paragraph", plain_text: "Uit de export.", position: 0, content_hash: "b" }],
    links: [{ block_id: block, reference_text: "Genesis 1:1", origin: "editor", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1 }],
    sermon: { speaker: "Ds. Fictief", organization: null, series: null, service_type: "Ochtenddienst" },
  };
}
const importNote = (q: pg.Client, e: ReturnType<typeof exported>) =>
  q.query("select * from public.import_note($1, 'hash', $2, $3, $4)", [JSON.stringify(e.note), JSON.stringify(e.blocks), JSON.stringify(e.links), JSON.stringify(e.sermon)]);
const rev = (number: number, reason = "afronden") => ({ number, reason, createdAt: "2024-05-12T12:00:00Z", metadata: { title: "Teruggezet" }, contentHash: `h${number}`, document: { type: "doc", content: [] } });

beforeAll(async () => {
  db = client();
  await db.connect();
  alice = await createUser(db);
  bob = await createUser(db);
});

afterAll(async () => {
  await deleteUser(db, alice);
  await deleteUser(db, bob);
  await db.end();
});

describe("import (AT-15)", () => {
  it("brings a note back with its document, indexes, sermon and history; a second import changes nothing", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const e = exported();
      const first = (await importNote(q, e)).rows[0];
      expect(first).toEqual({ old_id: e.note.id, new_id: e.note.id, skipped: false });

      const note = (await q.query("select title, status, event_date::text, created_at, completed_at, owner_id from public.notes where id = $1", [e.note.id])).rows[0];
      expect(note).toMatchObject({ title: "Teruggezet", status: "afgerond", event_date: "2024-05-12", owner_id: alice });
      expect(new Date(note.created_at).toISOString()).toBe("2024-05-12T09:00:00.000Z");
      expect((await q.query("select count(*)::int n from public.note_blocks where note_id = $1", [e.note.id])).rows[0].n).toBe(1);
      expect((await q.query("select count(*)::int n from public.passage_links where note_id = $1", [e.note.id])).rows[0].n).toBe(1);
      expect((await q.query("select s.name from public.sermon_details d join public.speakers s on s.id = d.speaker_id where d.note_id = $1", [e.note.id])).rows).toEqual([{ name: "Ds. Fictief" }]);

      expect((await q.query("select public.import_revisions($1, $2) n", [e.note.id, JSON.stringify([rev(1, "handmatig"), rev(2)])])).rows[0].n).toBe(2);
      const revs = (await q.query("select revision_number, reason, created_at from public.note_revisions where note_id = $1 order by 1", [e.note.id])).rows;
      expect(revs.map((r) => [r.revision_number, r.reason])).toEqual([[1, "handmatig"], [2, "afronden"]]);
      expect((await q.query("select current_revision from public.notes where id = $1", [e.note.id])).rows[0].current_revision).toBe(2);
      // history only grows forward, and stays immutable
      expect((await q.query("select public.import_revisions($1, $2) n", [e.note.id, JSON.stringify([rev(2), rev(1)])])).rows[0].n).toBe(0); // retry
      expect(await fails(q, "select public.import_revisions($1, $2)", [e.note.id, JSON.stringify([rev(3, "gewist")])])).toBe("23514");

      const again = (await importNote(q, { ...e, note: { ...e.note, title: "Overschreven?" } })).rows[0];
      expect(again).toEqual({ old_id: e.note.id, new_id: e.note.id, skipped: true });
      expect((await q.query("select title from public.notes where id = $1", [e.note.id])).rows[0].title).toBe("Teruggezet");
    });
  });

  it("never adds history to a note that was not just imported", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const doc = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() } }] };
      const id = (await q.query("select id from public.create_note('Gewoon', 'vrij', null, $1, 'h')", [JSON.stringify(doc)])).rows[0].id;
      expect(await fails(q, "select public.import_revisions($1, $2)", [id, JSON.stringify([rev(1)])])).toBe("42501");
      expect(await fails(q, "update public.notes set imported_at = now() where id = $1", [id])).toBe("42501");
    });
  });

  it("an id from another account gets a new id; that account is untouched (AT-08)", async () => {
    const e = exported();
    await as(db, { kind: "user", id: alice }, async (q) => {
      await importNote(q, e);
      await asUser(q, bob);
      const r = (await importNote(q, { ...e, note: { ...e.note, title: "Van Bob" } })).rows[0];
      expect(r.skipped).toBe(false);
      expect(r.new_id).not.toBe(e.note.id);
      expect((await q.query("select title from public.notes")).rows.map((x) => x.title)).toEqual(["Van Bob"]);
      expect(await fails(q, "select public.import_revisions($1, $2)", [e.note.id, JSON.stringify([rev(1)])])).toBe("42501");
      await asUser(q, alice);
      expect((await q.query("select title from public.notes where id = $1", [e.note.id])).rows[0].title).toBe("Teruggezet");
    });
  });

  it("brings back collections (with their tree), questions and templates, linked to the imported notes", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const e = exported();
      const { new_id } = (await importNote(q, e)).rows[0];
      const top = randomUUID();
      const sub = randomUUID();
      const question = randomUUID();
      const extras = {
        // child before parent on purpose
        collections: [
          { id: sub, parent_id: top, name: "Deel 1", collection_type: "preekserie", description: "" },
          { id: top, parent_id: null, name: "Serie", collection_type: "preekserie", description: "Alles" },
        ],
        collectionItems: [{ collection_id: sub, note_id: e.note.id, position: 0 }, { collection_id: sub, note_id: randomUUID(), position: 1 }],
        questions: [{ id: question, title: "Wat is licht?", description: "", status: "beantwoord", answer: "Gods eerste werk." }],
        questionNotes: [{ question_id: question, note_id: e.note.id }],
        questionPassages: [
          { question_id: question, label: "Genesis 1:3", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 3, end_chapter: 1, end_verse: 3 },
          { question_id: question, label: "Nergens 1:1", translation: "TEST", book: "XXX", start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1 },
        ],
        templates: [{ id: randomUUID(), name: "Mijn preekopzet", note_type: "preek", description: "", template_json: { parts: [{ kind: "kop", text: "Inleiding" }] } }],
      };
      const map = { [e.note.id]: new_id };
      const counts = (await q.query("select public.import_extras($1, $2) c", [JSON.stringify(extras), JSON.stringify(map)])).rows[0].c;
      expect(counts).toEqual({ collections: 2, collectionItems: 1, questions: 1, questionLinks: 2, templates: 1 });
      expect((await q.query("select parent_id from public.collections where id = $1", [sub])).rows[0].parent_id).toBe(top);
      expect((await q.query("select note_id from public.collection_items where collection_id = $1", [sub])).rows).toEqual([{ note_id: new_id }]);
      expect((await q.query("select status, resolved_at is not null as resolved from public.questions where id = $1", [question])).rows[0]).toEqual({ status: "beantwoord", resolved: true });
      expect((await q.query("select label from public.question_passages where question_id = $1", [question])).rows).toEqual([{ label: "Genesis 1:3" }]);

      // the same extras again: nothing new
      const twice = (await q.query("select public.import_extras($1, $2) c", [JSON.stringify(extras), JSON.stringify(map)])).rows[0].c;
      expect(twice).toEqual({ collections: 0, collectionItems: 0, questions: 0, questionLinks: 0, templates: 0 });
    });
  });

  it("is closed to visitors who are not signed in", async () => {
    await as(db, { kind: "anon" }, async (q) => {
      expect(await fails(q, "select * from public.import_note('{}', 'h', '[]', '[]', null)")).toBe("42501");
    });
  });
});
