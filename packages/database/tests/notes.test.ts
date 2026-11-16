// Sprint 3: notes, immutable revisions, version checks and passage links (BK-016..BK-024).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const DOC = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function createNote(q: pg.Client, title = "Preek over Genesis") {
  const { rows } = await q.query(
    "select * from public.create_note($1, 'preek', null, $2, 'h0')",
    [title, JSON.stringify(DOC(""))],
  );
  return rows[0] as { id: string; document_version: number; current_revision: number; status: string };
}

type SaveArgs = {
  id: string;
  base: number;
  text?: string;
  hash?: string;
  reason?: string | null;
  status?: string | null;
  links?: unknown[];
  title?: string;
};
function save(q: pg.Client, a: SaveArgs) {
  const block = randomUUID();
  return q.query(
    `select * from public.save_note($1, $2, $3, 'preek', null, $4, $5, $6, $7, $8, $9)`,
    [
      a.id,
      a.base,
      a.title ?? "Preek over Genesis",
      JSON.stringify(DOC(a.text ?? "tekst")),
      a.hash ?? `h-${a.text ?? "tekst"}`,
      JSON.stringify([{ block_id: block, block_type: "paragraph", plain_text: a.text ?? "tekst", position: 0, content_hash: "x" }]),
      JSON.stringify(a.links ?? []),
      a.reason ?? null,
      a.status ?? null,
    ],
  );
}

/** Runs a failing statement inside a savepoint, so the surrounding transaction stays usable. */
async function failCode(q: pg.Client, run: () => Promise<unknown>): Promise<string> {
  await q.query("savepoint expect_error");
  const code = await pgError(run());
  await q.query("rollback to savepoint expect_error");
  return code;
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

describe("notes", () => {
  it("creates a draft note with its document", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      const doc = (await q.query("select document_json from public.note_documents where note_id = $1", [n.id])).rows[0];
      return { n, doc };
    });
    expect(r.n).toMatchObject({ status: "concept", document_version: 1, current_revision: 0 });
    expect(r.doc.document_json.type).toBe("doc");
  });

  it("autosave stores the document and derived blocks without making a revision", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      const saved = (await save(q, { id: n.id, base: 1, text: "Eerste gedachte" })).rows[0];
      const blocks = (await q.query("select plain_text from public.note_blocks where note_id = $1", [n.id])).rows;
      const revisions = (await q.query("select count(*)::int as c from public.note_revisions where note_id = $1", [n.id])).rows[0];
      return { saved, blocks, revisions };
    });
    expect(r.saved).toMatchObject({ document_version: 2, current_revision: 0 });
    expect(r.blocks).toEqual([{ plain_text: "Eerste gedachte" }]);
    expect(r.revisions.c).toBe(0);
  });

  it("refuses a save based on an old version, but accepts an identical retry", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      await save(q, { id: n.id, base: 1, text: "A" });
      const retry = (await save(q, { id: n.id, base: 1, text: "A" })).rows[0];
      const conflict = await failCode(q, () => save(q, { id: n.id, base: 1, text: "B" }));
      const doc = (await q.query("select content_hash from public.note_documents where note_id = $1", [n.id])).rows[0];
      return { retry, conflict, doc };
    });
    expect(r.retry.document_version).toBe(2);
    expect(r.conflict).toBe("40001");
    expect(r.doc.content_hash).toBe("h-A");
  });

  it("makes revisions only for afronden/handmatig/pauze and skips unchanged pauses", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      await save(q, { id: n.id, base: 1, text: "A", reason: "pauze" });
      await save(q, { id: n.id, base: 2, text: "A", reason: "pauze" }); // nothing changed
      await save(q, { id: n.id, base: 3, text: "B" }); // autosave
      const done = (await save(q, { id: n.id, base: 4, text: "B", reason: "afronden", status: "afgerond" })).rows[0];
      const revs = (await q.query("select revision_number, reason, metadata_json->>'status' as status from public.note_revisions where note_id = $1 order by 1", [n.id])).rows;
      return { done, revs };
    });
    expect(r.done).toMatchObject({ status: "afgerond", current_revision: 2 });
    expect(r.done.completed_at).not.toBeNull();
    expect(r.revs).toEqual([
      { revision_number: 1, reason: "pauze", status: "concept" },
      { revision_number: 2, reason: "afronden", status: "afgerond" },
    ]);
  });

  it("revisions cannot be changed or deleted, not even by the database owner", async () => {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: alice, role: "authenticated" })]);
      const n = await createNote(db);
      await save(db, { id: n.id, base: 1, text: "A", reason: "handmatig" });
      expect(await failCode(db, () => db.query("update public.note_revisions set reason = 'pauze'"))).toBe(PG.insufficientPrivilege);
      await db.query("reset role");
      expect(await failCode(db, () => db.query("update public.note_revisions set reason = 'pauze' where note_id = $1", [n.id]))).toBe(PG.insufficientPrivilege);
      expect(await failCode(db, () => db.query("delete from public.note_revisions where note_id = $1", [n.id]))).toBe(PG.insufficientPrivilege);
    } finally {
      await db.query("rollback");
    }
  });

  it("the app cannot write note tables directly", async () => {
    const code = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(q.query("insert into public.notes (owner_id, title) values ($1, 'x')", [alice])),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("keeps notes private to their owner", async () => {
    let id = "";
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: alice, role: "authenticated" })]);
      id = (await createNote(db, "Geheim")).id;
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await db.query("select * from public.notes where id = $1", [id])).rowCount).toBe(0);
      expect((await db.query("select * from public.note_documents where note_id = $1", [id])).rowCount).toBe(0);
      expect(await failCode(db, () => save(db, { id, base: 1, text: "overschrijven" }))).toBe(PG.insufficientPrivilege);
      expect(await failCode(db, () => db.query("select public.set_note_archived($1, true)", [id]))).toBe(PG.insufficientPrivilege);
    } finally {
      await db.query("rollback");
    }
  });

  it("anonymous visitors cannot call the note functions", async () => {
    const code = await as(db, { kind: "anon" }, (q) =>
      pgError(q.query("select public.create_note('x', 'vrij', null, '{}'::jsonb, 'h')")),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("links a reference block to canonical verses and shows it in the reader", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q, "Schepping");
      await save(q, {
        id: n.id,
        base: 1,
        title: "Schepping",
        links: [{ block_id: randomUUID(), reference_text: "Genesis 1:2-3", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3 }],
      });
      const ranges = (await q.query(
        `select r.end_order - r.start_order as span, l.reference_text from public.passage_link_ranges r
         join public.passage_links l on l.id = r.passage_link_id where l.note_id = $1`, [n.id])).rows;
      const dots = (await q.query("select verse_number, title from public.notes_for_chapter('TEST', 'GEN', 1)")).rows;
      const badRef = await failCode(q, () => save(q, {
        id: n.id, base: 2,
        links: [{ block_id: randomUUID(), reference_text: "Genesis 1:99", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 99, end_chapter: 1, end_verse: 99 }],
      }));
      return { ranges, dots, badRef };
    });
    expect(r.ranges).toEqual([{ span: 1, reference_text: "Genesis 1:2-3" }]);
    expect(r.dots).toEqual([{ verse_number: 2, title: "Schepping" }, { verse_number: 3, title: "Schepping" }]);
    expect(r.badRef).toBe("22023");
  });

  it("archives and restores", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      const a = (await q.query("select archived_at from public.set_note_archived($1, true)", [n.id])).rows[0];
      const b = (await q.query("select archived_at from public.set_note_archived($1, false)", [n.id])).rows[0];
      return { a, b };
    });
    expect(r.a.archived_at).not.toBeNull();
    expect(r.b.archived_at).toBeNull();
  });
});
