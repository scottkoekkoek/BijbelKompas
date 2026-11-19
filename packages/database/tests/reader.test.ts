// Sprint 9: comparing translations (BK-011, AT-09) and highlights (BK-013). Fictitious TEST/TEST2 text only.
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
const passage = (sv: number, ev: number, translation = "TEST", chapter = 1) =>
  JSON.stringify({ label: `Genesis ${chapter}:${sv}-${ev}`, translation, book: "GEN", startChapter: chapter, startVerse: sv, endChapter: chapter, endVerse: ev });

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

describe("comparing translations (BK-011, AT-09)", () => {
  it("matches verses across different verse divisions and marks what is not one-to-one", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const rows = (await q.query("select * from public.compare_chapter('TEST', 'TEST2', 'GEN', 1)")).rows;
      expect(rows.map((r) => [r.a_key, r.b_keys, r.uncertain])).toEqual([
        ["GEN.1.1", ["GEN.1.1"], true], // TEST2 1:1 also covers 1:2
        ["GEN.1.2", ["GEN.1.1"], true],
        ["GEN.1.3", ["GEN.1.2"], false], // other number, same verse: exact
      ]);
      expect(rows[2].b_texts).toEqual(["[TESTTEKST 2] Andere regel 1.2."]);

      const back = (await q.query("select * from public.compare_chapter('TEST2', 'TEST', 'GEN', 1)")).rows;
      expect(back.map((r) => [r.a_key, r.b_keys, r.uncertain])).toEqual([
        ["GEN.1.1", ["GEN.1.1", "GEN.1.2"], true],
        ["GEN.1.2", ["GEN.1.3"], false],
      ]);
      // same division: nothing uncertain
      const same = (await q.query("select * from public.compare_chapter('TEST', 'TEST2', 'GEN', 2)")).rows;
      expect(same.map((r) => r.uncertain)).toEqual([false, false]);
    });
  });

  it("never returns text of a translation that may not be shown", async () => {
    await db.query("begin");
    try {
      await db.query("update public.bible_translations set license_expires_at = now() - interval '1 day' where code = 'TEST2'");
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      const rows = (await db.query("select * from public.compare_chapter('TEST', 'TEST2', 'GEN', 1)")).rows;
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.b_texts.length === 0)).toBe(true);
    } finally {
      await db.query("rollback");
    }
  });

  it("is closed to visitors who are not signed in", async () => {
    await as(db, { kind: "anon" }, async (q) => {
      expect(await fails(q, "select * from public.compare_chapter('TEST', 'TEST2', 'GEN', 1)")).toBe("42501");
    });
  });
});

describe("highlights (BK-013)", () => {
  it("stores a highlight once, shows it in every translation, and can change and remove it", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const h = (await q.query("select * from public.add_highlight($1, 'groen', 'Licht!')", [passage(2, 3)])).rows[0];
      expect(h).toMatchObject({ owner_id: alice, color: "groen", annotation: "Licht!", start_verse: 2, end_verse: 3 });

      // the same passage again: same highlight, new color
      const again = (await q.query("select * from public.add_highlight($1, 'blauw')", [passage(2, 3)])).rows[0];
      expect(again.id).toBe(h.id);
      expect((await q.query("select count(*)::int n from public.highlights")).rows[0].n).toBe(1);

      expect((await q.query("select verses from public.chapter_highlights('TEST', 'GEN', 1)")).rows).toEqual([{ verses: [2, 3] }]);
      // TEST2 numbers these canonical verses 1 and 2
      expect((await q.query("select verses, color from public.chapter_highlights('TEST2', 'GEN', 1)")).rows).toEqual([{ verses: [1, 2], color: "blauw" }]);
      expect((await q.query("select * from public.chapter_highlights('TEST', 'GEN', 2)")).rows).toEqual([]);

      await q.query("update public.highlights set color = 'roze', annotation = '' where id = $1", [h.id]);
      expect(await fails(q, "update public.highlights set color = 'paars' where id = $1", [h.id])).toBe("23514");
      expect(await fails(q, "update public.highlights set start_order = 1 where id = $1", [h.id])).toBe("42501");
      expect(await fails(q, "delete from public.highlights where id = $1", [h.id])).toBe("42501");
      expect(await fails(q, "insert into public.highlights (label, translation, book, start_chapter, start_verse, end_chapter, end_verse, start_order, end_order) values ('x','TEST','GEN',1,1,1,1,1,1)")).toBe("42501");

      expect((await q.query("select public.remove_highlight($1) ok", [h.id])).rows[0].ok).toBe(true);
      expect((await q.query("select count(*)::int n from public.highlights")).rows[0].n).toBe(0);
    });
  });

  it("refuses passages that do not exist and colors that are not offered", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const nowhere = JSON.stringify({ label: "x", translation: "TEST", book: "XXX", startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1 });
      expect(await fails(q, "select public.add_highlight($1, 'geel')", [nowhere])).toBe("22023");
      expect(await fails(q, "select public.add_highlight($1, 'paars')", [passage(1, 1)])).toBe("23514");
    });
  });

  it("keeps highlights private to their owner (AT-08)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const h = (await q.query("select * from public.add_highlight($1, 'geel')", [passage(1, 1)])).rows[0];
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.highlights")).rows).toEqual([]);
      expect((await q.query("select * from public.chapter_highlights('TEST', 'GEN', 1)")).rows).toEqual([]);
      expect((await q.query("update public.highlights set color = 'roze' where id = $1", [h.id])).rowCount).toBe(0);
      expect((await q.query("select public.remove_highlight($1) ok", [h.id])).rows[0].ok).toBe(false);
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      expect((await q.query("select color from public.highlights where id = $1", [h.id])).rows).toEqual([{ color: "geel" }]);
    });
  });

  it("comes back from an export once, skipping what is already there", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const rows = [
        { label: "Genesis 1:1", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1, color: "roze", annotation: "Begin", created_at: "2024-01-01T00:00:00Z" },
        { label: "Nergens", translation: "TEST", book: "XXX", start_chapter: 1, start_verse: 1, end_chapter: 1, end_verse: 1 },
      ];
      expect((await q.query("select public.import_highlights($1) n", [JSON.stringify(rows)])).rows[0].n).toBe(1);
      expect((await q.query("select public.import_highlights($1) n", [JSON.stringify(rows)])).rows[0].n).toBe(0);
      expect((await q.query("select color, annotation from public.highlights")).rows).toEqual([{ color: "roze", annotation: "Begin" }]);
    });
    await as(db, { kind: "anon" }, async (q) => {
      expect(await fails(q, "select public.import_highlights('[]')")).toBe("42501");
      expect(await fails(q, "select public.add_highlight($1, 'geel')", [passage(1, 1)])).toBe("42501");
    });
  });
});
