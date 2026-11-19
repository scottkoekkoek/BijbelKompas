// Sprint 10: release-gate acceptance tests that were not yet covered on their own (AT-04, AT-18).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser } from "./helpers";

let db: pg.Client;
let alice: string;

const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() }, content: [{ type: "text", text }] }] });

async function save(q: pg.Client, id: string, base: number, text: string, reason: string | null) {
  const d = doc(text);
  const block = d.content[0]!.attrs.blockId;
  return (
    await q.query("select * from public.save_note($1, $2, 'Preek', 'preek', null, $3, $4, $5, '[]', $6, null)", [
      id, base, JSON.stringify(d), `h-${text}`,
      JSON.stringify([{ block_id: block, block_type: "paragraph", plain_text: text, position: 0, content_hash: "x" }]), reason,
    ])
  ).rows[0] as { document_version: number; current_revision: number };
}

beforeAll(async () => {
  db = client();
  await db.connect();
  alice = await createUser(db);
});

afterAll(async () => {
  await deleteUser(db, alice);
  await db.end();
});

describe("release gate", () => {
  it("restoring revision 8 of 20 makes revision 21 and keeps 1-20 unchanged (AT-04)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = (await q.query("select id, document_version from public.create_note('Preek', 'preek', null, $1, 'h0')", [JSON.stringify(doc(""))])).rows[0];
      let version = n.document_version as number;
      for (let i = 1; i <= 20; i++) version = (await save(q, n.id, version, `versie ${i}`, "handmatig")).document_version;
      const before = (await q.query("select revision_number, content_hash, document_json from public.note_revisions where note_id = $1 order by 1", [n.id])).rows;
      expect(before).toHaveLength(20);

      // what the app does on "Deze versie terugzetten": the old content as a new 'herstel' save
      const eight = before[7]!;
      const text = eight.document_json.content[0].content[0].text as string;
      expect(text).toBe("versie 8");
      const restored = await save(q, n.id, version, text, "herstel");
      expect(restored.current_revision).toBe(21);

      const after = (await q.query("select revision_number, reason, content_hash, document_json from public.note_revisions where note_id = $1 order by 1", [n.id])).rows;
      expect(after).toHaveLength(21);
      expect(after.slice(0, 20).map((r) => [r.revision_number, r.content_hash])).toEqual(before.map((r) => [r.revision_number, r.content_hash]));
      expect(after[20]).toMatchObject({ revision_number: 21, reason: "herstel", content_hash: "h-versie 8" });
    });
  });

  it("stores and indexes a note of 20,000 words without loss (AT-18)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const words = Array.from({ length: 20_000 }, (_, i) => (i === 19_999 ? "slotwoordzeldzaam" : `woord${i % 500}`));
      const paragraphs = Array.from({ length: 200 }, (_, p) => words.slice(p * 100, p * 100 + 100).join(" "));
      const d = { type: "doc", content: paragraphs.map((t) => ({ type: "paragraph", attrs: { blockId: randomUUID() }, content: [{ type: "text", text: t }] })) };
      const blocks = d.content.map((b, i) => ({ block_id: b.attrs.blockId, block_type: "paragraph", plain_text: paragraphs[i], position: i, content_hash: `b${i}` }));
      const n = (await q.query("select id, document_version from public.create_note('Lange notitie', 'vrij', null, $1, 'h0')", [JSON.stringify(doc(""))])).rows[0];
      await q.query("select * from public.save_note($1, $2, 'Lange notitie', 'vrij', null, $3, 'h-lang', $4, '[]', 'handmatig', null)", [
        n.id, n.document_version, JSON.stringify(d), JSON.stringify(blocks),
      ]);
      const stored = (await q.query("select document_json from public.note_documents where note_id = $1", [n.id])).rows[0].document_json;
      const all = stored.content.map((p: { content: { text: string }[] }) => p.content[0]!.text).join(" ").split(" ");
      expect(all).toHaveLength(20_000);
      expect(all.at(-1)).toBe("slotwoordzeldzaam");
      expect((await q.query("select count(*)::int n from public.note_blocks where note_id = $1", [n.id])).rows[0].n).toBe(200);
      expect((await q.query("select count(*)::int n from public.note_revisions where note_id = $1", [n.id])).rows[0].n).toBe(1);
    });
  });
});
