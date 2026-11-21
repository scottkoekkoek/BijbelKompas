// Sprint 2: canonical verses (BK-015), the Statenvertaling entry (BK-010) and reading positions.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const POSITION = `insert into public.reading_positions (owner_id, translation_id, book_id, chapter_number)
  select $1, t.id, b.id, $2 from public.bible_translations t, public.bible_books b
  where t.code = 'TEST' and b.book_code = $3`;

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

describe("canonical verses", () => {
  it("has 31102 verses with a stable order", async () => {
    const { rows } = await db.query(
      `select count(*)::int as n, count(distinct canonical_order)::int as orders
       from public.bible_verses v join public.bible_canons c on c.id = v.canon_id where c.code = 'PROT66'`,
    );
    expect(rows[0]).toEqual({ n: 31102, orders: 31102 });
  });

  it("knows the last verse of the Bible", async () => {
    const { rows } = await db.query(
      `select b.book_code, v.chapter_number, v.verse_number from public.bible_verses v
       join public.bible_books b on b.id = v.book_id order by v.canonical_order desc limit 1`,
    );
    expect(rows[0]).toEqual({ book_code: "REV", chapter_number: 22, verse_number: 21 });
  });
});

describe("Statenvertaling entry", () => {
  it("is public domain, may be explained by AI (ADR-017), and off until its text is imported", async () => {
    const { rows } = await db.query(
      `select rights_status, offline_allowed, ai_processing_allowed, attribution is not null as attributed
       from public.bible_translations where code = 'SV'`,
    );
    expect(rows[0]).toEqual({ rights_status: "public_domain", offline_allowed: true, ai_processing_allowed: true, attributed: true });
  });
});

describe("reading positions", () => {
  it("lets the owner save and move their position", async () => {
    const row = await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query(POSITION, [alice, 1, "GEN"]);
      await q.query(
        `update public.reading_positions set chapter_number = 2 where owner_id = $1`,
        [alice],
      );
      return (await q.query("select chapter_number from public.reading_positions")).rows[0];
    });
    expect(row).toEqual({ chapter_number: 2 });
  });

  it("hides other people's positions and refuses writing them", async () => {
    await db.query(POSITION, [alice, 1, "GEN"]);
    try {
      const seen = await as(db, { kind: "user", id: bob }, async (q) => (await q.query("select * from public.reading_positions")).rowCount);
      expect(seen).toBe(0);
      const code = await as(db, { kind: "user", id: bob }, (q) => pgError(q.query(POSITION, [alice, 1, "EXO"])));
      expect(code).toBe(PG.insufficientPrivilege);
      const updated = await as(db, { kind: "user", id: bob }, async (q) =>
        (await q.query("update public.reading_positions set chapter_number = 3 where owner_id = $1", [alice])).rowCount,
      );
      expect(updated).toBe(0);
    } finally {
      await db.query("delete from public.reading_positions where owner_id = $1", [alice]);
    }
  });

  it("rejects a chapter the book does not have", async () => {
    const code = await as(db, { kind: "user", id: alice }, (q) => pgError(q.query(POSITION, [alice, 2, "OBA"])));
    expect(code).toBe(PG.checkViolation);
  });

  it("anonymous visitors cannot read positions", async () => {
    const code = await as(db, { kind: "anon" }, (q) => pgError(q.query("select * from public.reading_positions")));
    expect(code).toBe(PG.insufficientPrivilege);
  });
});
