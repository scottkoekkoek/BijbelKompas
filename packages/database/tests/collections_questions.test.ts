// Sprint 7: collections, research questions and the timeline (BK-047..BK-053; AT-08).
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

/** Runs one statement that must fail, inside a savepoint so the test transaction goes on. */
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

async function note(q: pg.Client, title: string, eventDate: string | null = null): Promise<string> {
  const doc = { type: "doc", content: [{ type: "paragraph", attrs: { blockId: crypto.randomUUID() } }] };
  const { rows } = await q.query("select id from public.create_note($1, 'preek', $2, $3, 'h')", [title, eventDate, JSON.stringify(doc)]);
  return rows[0].id as string;
}
const collection = async (q: pg.Client, name: string, parent: string | null = null, type = "dossier") =>
  (await q.query("insert into public.collections (name, parent_id, collection_type) values ($1, $2, $3) returning id", [name, parent, type])).rows[0]
    .id as string;

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

describe("collections (BK-047, BK-048)", () => {
  it("one note sits in several collections without copies, in the chosen order", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const a = await note(q, "Eerste");
      const b = await note(q, "Tweede");
      const serie = await collection(q, "Johannes-serie", null, "preekserie");
      const thema = await collection(q, "Genade", null, "thema");
      await q.query("insert into public.collection_items (collection_id, note_id, position) values ($1, $2, 0), ($1, $3, 1), ($4, $2, 0)", [serie, a, b, thema]);
      expect(await fails(q, "insert into public.collection_items (collection_id, note_id) values ($1, $2)", [serie, a])).toBe("23505");
      expect((await q.query("select count(*)::int as n from public.notes where title = 'Eerste'")).rows[0].n).toBe(1);

      await q.query("select public.reorder_collection($1, $2::uuid[])", [serie, [b, a]]);
      const order = await q.query("select note_id from public.collection_items where collection_id = $1 order by position", [serie]);
      expect(order.rows.map((r) => r.note_id)).toEqual([b, a]);

      // taking a note out of a collection never touches the note or its other collections
      expect((await q.query("select public.remove_collection_item($1, $2) as ok", [serie, a])).rows[0].ok).toBe(true);
      expect((await q.query("select count(*)::int as n from public.notes where id in ($1, $2)", [a, b])).rows[0].n).toBe(2);
      expect((await q.query("select count(*)::int as n from public.collection_items where note_id = $1", [a])).rows[0].n).toBe(1);
      // collections are archived, never deleted by the app
      expect(await fails(q, "delete from public.collections where id = $1", [serie])).toBe("42501");
      expect(await fails(q, "delete from public.collection_items where collection_id = $1", [serie])).toBe("42501");
    });
  });

  it("refuses cycles", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const top = await collection(q, "Boven");
      const mid = await collection(q, "Midden", top);
      const low = await collection(q, "Onder", mid);
      expect(await fails(q, "update public.collections set parent_id = $1 where id = $2", [low, top])).toBe("22023");
      expect(await fails(q, "update public.collections set parent_id = $1 where id = $1", [top])).toBe("22023");
      await q.query("update public.collections set parent_id = null where id = $1", [mid]);
      await q.query("update public.collections set parent_id = $1 where id = $2", [low, top]); // no longer a cycle
      const { rows } = await q.query("select parent_id from public.collections where id = $1", [top]);
      expect(rows).toEqual([{ parent_id: low }]);
    });
  });

  it("another user can neither see nor fill someone else's collection (AT-08)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const own = await collection(q, "Privé");
      const n = await note(q, "Van Alice");
      await q.query("insert into public.collection_items (collection_id, note_id) values ($1, $2)", [own, n]);
      await asUser(q, bob);
      expect((await q.query("select * from public.collections where id = $1", [own])).rows).toEqual([]);
      expect((await q.query("select * from public.collection_items where collection_id = $1", [own])).rows).toEqual([]);
      const mine = await collection(q, "Van Bob");
      // Bob cannot put Alice's note in his collection, nor hang his collection under hers
      expect(await fails(q, "insert into public.collection_items (collection_id, note_id) values ($1, $2)", [mine, n])).toBe("22023");
      expect(await fails(q, "update public.collections set parent_id = $1 where id = $2", [own, mine])).toBe("22023");
      expect(await fails(q, "insert into public.collections (owner_id, name) values ($1, 'Vals')", [alice])).toBe("42501");
      expect((await q.query("select public.remove_collection_item($1, $2) as ok", [own, n])).rows[0].ok).toBe(false);
      await q.query("update public.collections set name = 'Overgenomen' where id = $1", [own]); // RLS: nothing happens
      await asUser(q, alice);
      expect((await q.query("select name from public.collections where id = $1", [own])).rows).toEqual([{ name: "Privé" }]);
      expect((await q.query("select count(*)::int as n from public.collection_items where collection_id = $1", [own])).rows[0].n).toBe(1);
    });
  });
});

describe("research questions (BK-049, BK-050, BK-051)", () => {
  it("only the owner sets the status; resolved_at follows it", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const { rows } = await q.query("insert into public.questions (title) values ('Wat is genade?') returning *");
      const id = rows[0].id as string;
      expect(rows[0]).toMatchObject({ status: "open", resolved_at: null });
      const answered = (await q.query("update public.questions set status = 'beantwoord', answer = 'Onverdiende gunst.' where id = $1 returning resolved_at", [id])).rows[0];
      expect(answered.resolved_at).not.toBeNull();
      const back = (await q.query("update public.questions set status = 'in_onderzoek' where id = $1 returning resolved_at", [id])).rows[0];
      expect(back.resolved_at).toBeNull();
      expect(await fails(q, "update public.questions set status = 'gesloten' where id = $1", [id])).toBe("23514");
      expect(await fails(q, "update public.questions set resolved_at = now() where id = $1", [id])).toBe("42501");
    });
  });

  it("links notes and passages, and finds the question per verse (AT-08)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const id = (await q.query("insert into public.questions (title) values ('Over het licht') returning id")).rows[0].id as string;
      const n = await note(q, "Licht");
      await q.query("insert into public.question_notes (question_id, note_id) values ($1, $2)", [id, n]);
      const passage = { label: "Genesis 1:2-3", translation: "TEST", book: "GEN", startChapter: 1, startVerse: 2, endChapter: 1, endVerse: 3 };
      await q.query("select public.add_question_passage($1, $2)", [id, JSON.stringify(passage)]);
      await q.query("select public.add_question_passage($1, $2)", [id, JSON.stringify(passage)]); // twice: still one
      expect((await q.query("select count(*)::int as n from public.question_passages where question_id = $1", [id])).rows[0].n).toBe(1);
      expect(
        await fails(q, "select public.add_question_passage($1, $2)", [id, JSON.stringify({ ...passage, book: "XXX" })]),
      ).toBe("22023");
      expect(await fails(q, "insert into public.question_passages (question_id, owner_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order) values ($1, $2, 'x', 'TEST', 'GEN', 1, 1, 1, 1, 1, 1)", [id, alice])).toBe("42501");

      expect((await q.query("select question_id, label from public.passage_questions('TEST', 'GEN', 1, 3, 3)")).rows).toEqual([
        { question_id: id, label: "Genesis 1:2-3" },
      ]);
      expect((await q.query("select * from public.passage_questions('TEST', 'GEN', 1, 1, 1)")).rows).toEqual([]);
      const pid = (await q.query("select id from public.question_passages where question_id = $1", [id])).rows[0].id;

      await asUser(q, bob);
      expect((await q.query("select * from public.passage_questions('TEST', 'GEN', 1, 1, 5)")).rows).toEqual([]);
      expect((await q.query("select * from public.questions where id = $1", [id])).rows).toEqual([]);
      expect(await fails(q, "select public.add_question_passage($1, $2)", [id, JSON.stringify(passage)])).toBe("42501");
      const bobs = (await q.query("insert into public.questions (title) values ('Van Bob') returning id")).rows[0].id as string;
      expect(await fails(q, "insert into public.question_notes (question_id, note_id) values ($1, $2)", [bobs, n])).toBe("22023");
      expect((await q.query("select public.unlink_question_note($1, $2) as ok", [id, n])).rows[0].ok).toBe(false);
      expect((await q.query("select public.remove_question_passage($1, $2) as ok", [id, pid])).rows[0].ok).toBe(false);

      await asUser(q, alice);
      expect((await q.query("select public.unlink_question_note($1, $2) as ok", [id, n])).rows[0].ok).toBe(true);
      expect((await q.query("select public.remove_question_passage($1, $2) as ok", [id, pid])).rows[0].ok).toBe(true);
      expect((await q.query("select count(*)::int as n from public.notes where id = $1", [n])).rows[0].n).toBe(1);
    });
  });
});

describe("timeline (BK-052, BK-053)", () => {
  it("sorts on the event date, falls back to the day of writing, and filters on collection with subcollections", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const old = await note(q, "Preek uit 2019", "2019-03-10");
      const recent = await note(q, "Preek uit 2025", "2025-06-01");
      const undated = await note(q, "Zonder datum");
      const top = await collection(q, "Alles");
      const sub = await collection(q, "Deel", top);
      await q.query("insert into public.collection_items (collection_id, note_id) values ($1, $2)", [sub, old]);

      const all = (await q.query("select note_id, event_date::text, has_event_date from public.timeline_notes()")).rows;
      const mine = all.filter((r) => [old, recent, undated].includes(r.note_id));
      expect(mine.map((r) => r.note_id)).toEqual([undated, recent, old]);
      expect(mine[0].has_event_date).toBe(false);
      expect(mine[2]).toMatchObject({ event_date: "2019-03-10", has_event_date: true });

      const inTop = (await q.query("select note_id from public.timeline_notes(p_collection => $1)", [top])).rows;
      expect(inTop).toEqual([{ note_id: old }]);
      const period = (await q.query("select note_id from public.timeline_notes(p_from => '2025-01-01', p_to => '2025-12-31')")).rows;
      expect(period.map((r) => r.note_id)).toContain(recent);
      expect(period.map((r) => r.note_id)).not.toContain(old);

      await asUser(q, bob);
      expect((await q.query("select * from public.timeline_notes(p_collection => $1)", [top])).rows).toEqual([]);
      const bobsView = (await q.query("select note_id from public.timeline_notes()")).rows.map((r) => r.note_id);
      expect(bobsView).not.toContain(old);
    });
  });
});
