// Ronde 3 §5: a summary saved with its source note. Only the owner, the note never changes, and a
// later save replaces it deliberately.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = client();
  await db.connect();
  alice = await createUser(db);
  bob = await createUser(db);
  await db.query("update public.user_preferences set ai_enabled = true where user_id in ($1, $2)", [alice, bob]);
});
afterAll(async () => {
  await deleteUser(db, alice);
  await deleteUser(db, bob);
  await db.end();
});

async function outline(q: pg.Client, note: string, key: string, summary: string) {
  const j = (await q.query("select * from public.ai_reserve('opzet', $1, 0.01, 'fictief', 'test-1', $2, 1)", [key, note])).rows[0];
  return (await q.query("select * from public.ai_add_outline($1, $2, 'Kern', '[]'::jsonb, '')", [j.id, summary])).rows[0] as { id: string };
}

describe("samenvatting bij de notitie", () => {
  it("saves, replaces and deletes; the note and its document stay as they were", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const doc = JSON.stringify({ type: "doc", content: [] });
      const n = (await q.query("select * from public.create_note('Bron', 'vrij', null, $1, 'h0')", [doc])).rows[0];
      const before = (await q.query("select document_version, current_revision from public.notes where id = $1", [n.id])).rows[0];
      const o1 = await outline(q, n.id, "a", "Eerste samenvatting");
      const s1 = (await q.query("select * from public.save_note_summary($1, $2)", [n.id, o1.id])).rows[0];
      expect(s1.summary).toBe("Eerste samenvatting");
      const o2 = await outline(q, n.id, "b", "Tweede samenvatting");
      await q.query("select * from public.save_note_summary($1, $2)", [n.id, o2.id]);
      const rows = (await q.query("select summary from public.note_summaries where note_id = $1", [n.id])).rows;
      expect(rows).toEqual([{ summary: "Tweede samenvatting" }]);
      const after = (await q.query("select document_version, current_revision from public.notes where id = $1", [n.id])).rows[0];
      expect(after).toEqual(before);

      // another user sees nothing and can change nothing
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.note_summaries")).rows).toHaveLength(0);
      await q.query("savepoint s");
      expect(await pgError(q.query("select public.save_note_summary($1, $2)", [n.id, o1.id]))).toBe("42501");
      await q.query("rollback to savepoint s");
      expect((await q.query("select public.delete_note_summary($1) as d", [n.id])).rows[0].d).toBe(false);

      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      expect((await q.query("select public.delete_note_summary($1) as d", [n.id])).rows[0].d).toBe(true);
      expect((await q.query("select count(*)::int as c from public.notes where id = $1", [n.id])).rows[0].c).toBe(1);
    });
  });

  it("cannot be written directly", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await pgError(q.query("insert into public.note_summaries (note_id, owner_id, source_revision, content_hash, summary, main_thought, model_version) values (gen_random_uuid(), $1, 0, 'x', 's', 'm', 'x')", [alice]))).toBe("42501");
    });
  });
});
