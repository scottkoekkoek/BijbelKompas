// BK-006, afspraak 2 + 5: canonical Bible identity and translation rights are enforced by the database.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let user: string;

beforeAll(async () => {
  db = client();
  await db.connect();
  user = await createUser(db);
});

afterAll(async () => {
  await deleteUser(db, user);
  await db.end();
});

describe("canon reference data", () => {
  it("has 66 books and 1189 chapters in canonical order", async () => {
    const { rows } = await db.query(
      `select count(*)::int as books, sum(chapter_count)::int as chapters,
              min(book_order)::int as first, max(book_order)::int as last
       from public.bible_books b join public.bible_canons c on c.id = b.canon_id where c.code = 'PROT66'`,
    );
    expect(rows[0]).toEqual({ books: 66, chapters: 1189, first: 1, last: 66 });
  });

  it("signed-in users can read books, anonymous visitors cannot", async () => {
    const n = await as(db, { kind: "user", id: user }, async (q) => (await q.query("select 1 from public.bible_books")).rowCount);
    expect(n).toBe(66);
    const code = await as(db, { kind: "anon" }, (q) => pgError(q.query("select * from public.bible_books")));
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("signed-in users cannot change reference data", async () => {
    const code = await as(db, { kind: "user", id: user }, (q) =>
      pgError(q.query("update public.bible_books set name = 'X' where book_code = 'GEN'")),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("rejects a verse in a chapter the book does not have", async () => {
    const code = await pgError(
      db.query(
        `insert into public.bible_verses (canon_id, book_id, chapter_number, verse_number, canonical_order)
         select canon_id, id, 2, 1, 999999999 from public.bible_books where book_code = 'OBA'`,
      ),
    );
    expect(code).toBe(PG.checkViolation);
  });

  it("rejects a verse whose book belongs to another canon", async () => {
    await db.query("begin");
    try {
      await db.query("insert into public.bible_canons (code, name) values ('OTHER', 'Andere canon')");
      const code = await pgError(
        db.query(
          `insert into public.bible_verses (canon_id, book_id, chapter_number, verse_number, canonical_order)
           select (select id from public.bible_canons where code = 'OTHER'), id, 1, 1, 1
           from public.bible_books where book_code = 'GEN'`,
        ),
      );
      expect(code).toBe(PG.foreignKeyViolation);
    } finally {
      await db.query("rollback");
    }
  });
});

describe("translation rights", () => {
  it("lists HSV and NBV21 as reference-only without offline or AI rights", async () => {
    const { rows } = await db.query(
      `select code, rights_status, offline_allowed, ai_processing_allowed
       from public.bible_translations where code in ('HSV', 'NBV21') order by code`,
    );
    expect(rows).toEqual([
      { code: "HSV", rights_status: "reference_only", offline_allowed: false, ai_processing_allowed: false },
      { code: "NBV21", rights_status: "reference_only", offline_allowed: false, ai_processing_allowed: false },
    ]);
  });

  it("refuses to store text for a reference-only translation, even as superuser", async () => {
    const code = await pgError(
      db.query(
        `insert into public.translation_segments (translation_id, segment_key, reference_label, text, display_order)
         select id, 'GEN.1.1', 'Genesis 1:1', 'x', 1 from public.bible_translations where code = 'HSV'`,
      ),
    );
    expect(code).toBe(PG.checkViolation);
  });

  it("refuses offline rights on a reference-only translation", async () => {
    const code = await pgError(db.query("update public.bible_translations set offline_allowed = true where code = 'HSV'"));
    expect(code).toBe(PG.checkViolation);
  });

  it("refuses to mark a translation with text as reference-only", async () => {
    const code = await pgError(
      db.query("update public.bible_translations set rights_status = 'reference_only', offline_allowed = false where code = 'TEST'"),
    );
    expect(code).toBe(PG.checkViolation);
  });

  it("shows fixture text and its canonical mapping to signed-in users", async () => {
    const rows = await as(db, { kind: "user", id: user }, async (q) =>
      (
        await q.query(
          `select s.segment_key, m.mapping_type, v.chapter_number, v.verse_number
           from public.translation_segments s
           join public.bible_translations t on t.id = s.translation_id
           join public.verse_mappings m on m.segment_id = s.id
           join public.bible_verses v on v.id = m.canonical_verse_id
           where t.code = 'TEST' order by s.display_order`,
        )
      ).rows,
    );
    expect(rows).toEqual([
      { segment_key: "GEN.1.1", mapping_type: "exact", chapter_number: 1, verse_number: 1 },
      { segment_key: "GEN.1.2", mapping_type: "exact", chapter_number: 1, verse_number: 2 },
      { segment_key: "GEN.1.3", mapping_type: "exact", chapter_number: 1, verse_number: 3 },
    ]);
  });

  it("hides disabled translations and their text", async () => {
    await db.query("begin");
    try {
      await db.query("update public.bible_translations set enabled = false where code = 'TEST'");
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
      const t = await db.query("select 1 from public.bible_translations where code = 'TEST'");
      const s = await db.query("select 1 from public.translation_segments");
      const m = await db.query("select 1 from public.verse_mappings");
      expect([t.rowCount, s.rowCount, m.rowCount]).toEqual([0, 0, 0]);
    } finally {
      await db.query("rollback");
    }
  });

  it("hides text once a licence has expired", async () => {
    await db.query("begin");
    try {
      await db.query("update public.bible_translations set license_expires_at = now() - interval '1 day' where code = 'TEST'");
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: "authenticated" })]);
      expect((await db.query("select 1 from public.translation_segments")).rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});
