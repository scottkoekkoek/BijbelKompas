// Ronde 3 §3: drafts to the trash and back. Only drafts, only the owner, and the trash stays out of
// every list and search function.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "prullenbaktekst" }] }] });

async function draft(q: pg.Client, title: string) {
  const { rows } = await q.query("select * from public.create_note($1, 'vrij', null, $2, 'h0')", [title, DOC]);
  const n = rows[0] as { id: string; document_version: number };
  await q.query(
    `select * from public.save_note($1, $2, $3, 'vrij', null, $4, 'h1', $5, '[]'::jsonb)`,
    [n.id, n.document_version, title, DOC, JSON.stringify([{ block_id: crypto.randomUUID(), block_type: "paragraph", plain_text: "prullenbaktekst woordje", position: 0, content_hash: "x" }])],
  );
  return n.id;
}

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

describe("prullenbak", () => {
  it("throws a draft away and brings it back unchanged; the owner only", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const id = await draft(q, "Weg te gooien");
      const search = async () => (await q.query("select note_id from public.search_notes('woordje', null, null, null, null, null, null, false, 50)")).rows.map((r) => r.note_id);
      expect(await search()).toContain(id);

      const t = await q.query("select * from public.set_note_trashed($1, true)", [id]);
      expect(t.rows[0].deleted_at).not.toBeNull();
      expect(await search()).not.toContain(id);
      // still readable by the owner (to restore it), with its text
      expect((await q.query("select document_json from public.note_documents where note_id = $1", [id])).rows).toHaveLength(1);

      const r = await q.query("select * from public.set_note_trashed($1, false)", [id]);
      expect(r.rows[0].deleted_at).toBeNull();
      expect(r.rows[0].status).toBe("concept");
      expect(await search()).toContain(id);

      // another user can neither throw it away nor bring it back
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await failCode(q, () => q.query("select public.set_note_trashed($1, true)", [id]))).toBe(PG.insufficientPrivilege);
    });
  });

  it("never takes a finished note", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const id = await draft(q, "Afgerond");
      const v = (await q.query("select document_version from public.notes where id = $1", [id])).rows[0].document_version;
      await q.query(`select * from public.save_note($1, $2, 'Afgerond', 'vrij', null, $3, 'h2', '[]'::jsonb, '[]'::jsonb, 'afronden', 'afgerond')`, [id, v, DOC]);
      expect(await failCode(q, () => q.query("select public.set_note_trashed($1, true)", [id]))).toBe("22023");
    });
    // and the table refuses it directly too
    await db.query("begin");
    try {
      expect(await pgError(db.query("insert into public.notes (owner_id, status, deleted_at) values ($1, 'afgerond', now())", [alice]))).toBe(PG.checkViolation);
    } finally {
      await db.query("rollback");
    }
  });

  it("every list and search function leaves the trash out", async () => {
    const { rows } = await db.query(
      `select proname, prosrc from pg_proc join pg_namespace s on s.oid = pronamespace
       where s.nspname = 'public' and proname in ('notes_for_chapter', 'search_notes', 'passage_notes', 'timeline_notes', 'ai_candidates', 'ai_fragments')`,
    );
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.prosrc, r.proname).toContain("deleted_at is null");
  });
});
