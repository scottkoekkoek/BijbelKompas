// Sprint 6: verses linked to text blocks and found back per verse (BK-030, BK-031; AT-08).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const link = (block: string, start: number, end: number, label: string) => ({
  block_id: block, reference_text: label, origin: "editor", translation: "TEST", book: "GEN",
  start_chapter: 1, start_verse: start, end_chapter: 1, end_verse: end,
});

async function noteWithLinks(q: pg.Client, title: string, links: unknown[], blocks: { id: string; text: string }[]) {
  const doc = { type: "doc", content: blocks.map((b) => ({ type: "paragraph", attrs: { blockId: b.id }, content: [{ type: "text", text: b.text }] })) };
  const { rows } = await q.query("select * from public.create_note($1, 'bijbelstudie', null, $2, 'h0')", [title, JSON.stringify(doc)]);
  const note = rows[0] as { id: string; document_version: number };
  await q.query(`select * from public.save_note($1, $2, $3, 'bijbelstudie', null, $4, 'h1', $5, $6, null, null, null)`, [
    note.id,
    note.document_version,
    title,
    JSON.stringify(doc),
    JSON.stringify(blocks.map((b, position) => ({ block_id: b.id, block_type: "paragraph", plain_text: b.text, position, content_hash: b.id }))),
    JSON.stringify(links),
  ]);
  return note.id;
}

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

describe("block links (BK-030)", () => {
  it("one block can name several passages; each becomes a range of that block", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const block = randomUUID();
      const id = await noteWithLinks(q, "Twee passages", [link(block, 1, 1, "Genesis 1:1"), link(block, 3, 3, "Genesis 1:3")], [
        { id: block, text: "Licht en begin." },
      ]);
      const { rows } = await q.query(
        `select pl.reference_text, r.range_order, r.end_order - r.start_order as span
         from public.passage_links pl join public.passage_link_ranges r on r.passage_link_id = pl.id
         where pl.note_id = $1 order by r.range_order`,
        [id],
      );
      expect(rows).toEqual([
        { reference_text: "Genesis 1:1; Genesis 1:3", range_order: 0, span: 0 },
        { reference_text: "Genesis 1:1; Genesis 1:3", range_order: 1, span: 0 },
      ]);
    });
  });
});

describe("notes per verse (BK-031)", () => {
  it("finds the linked block and its text, and only the owner's notes (AT-08)", async () => {
    const block = randomUUID();
    const other = randomUUID();
    await as(db, { kind: "user", id: alice }, async (q) => {
      const id = await noteWithLinks(q, "Over vers twee", [link(block, 2, 3, "Genesis 1:2-3")], [
        { id: other, text: "Inleiding zonder koppeling." },
        { id: block, text: "De Geest zweefde." },
      ]);
      const hit = (await q.query("select * from public.passage_notes('TEST', 'GEN', 1, 3, 3)")).rows;
      expect(hit).toEqual([
        expect.objectContaining({ note_id: id, block_id: block, reference_text: "Genesis 1:2-3", snippet: "De Geest zweefde." }),
      ]);
      expect((await q.query("select * from public.passage_notes('TEST', 'GEN', 1, 1, 1)")).rows).toEqual([]);
      // another user asking about the same verses sees nothing
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.passage_notes('TEST', 'GEN', 1, 1, 3)")).rows).toEqual([]);
    });
  });
});

describe("notes per verse without the translation's text (Ronde 3, Joh 16:12–14)", () => {
  it("finds a note linked to verse 13 when asking for 12–14, also where the translation has no text", async () => {
    const block = randomUUID();
    await as(db, { kind: "user", id: alice }, async (q) => {
      const v13 = { ...link(block, 13, 13, "Johannes 16:13"), book: "JHN", start_chapter: 16, end_chapter: 16 };
      const id = await noteWithLinks(q, "De Geest der waarheid", [v13], [{ id: block, text: "Hij zal u in de waarheid leiden." }]);
      // TEST has no text for John: the range is resolved in canonical numbering, as when saving
      const hit = (await q.query("select * from public.passage_notes('TEST', 'JHN', 16, 12, 14)")).rows;
      expect(hit).toEqual([expect.objectContaining({ note_id: id, block_id: block, reference_text: "Johannes 16:13" })]);
      expect((await q.query("select * from public.passage_notes('TEST', 'JHN', 16, 14, 15)")).rows).toEqual([]);
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.passage_notes('TEST', 'JHN', 16, 12, 14)")).rows).toEqual([]);
    });
  });
});
