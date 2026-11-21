// Feature 6: personal reading progress per canonical verse (ADR-015). Fictitious users only.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

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

const mark = (q: pg.Client, ch: number, from: number, to: number, read = true, book = "JHN") =>
  q.query("select public.reading_mark('SV', $1, $2, $3, $4, $5) as n", [book, ch, from, to, read]).then((r) => r.rows[0].n as number);
const chapter = (q: pg.Client, ch: number, book = "JHN") =>
  q.query("select total, read from public.reading_chapters($1) where chapter = $2", [book, ch]).then((r) => r.rows[0] as { total: number; read: number });
const next = (q: pg.Client, book = "JHN", ch: number | null = null) =>
  q.query("select chapter, verse from public.reading_next($1, $2)", [book, ch]).then((r) => r.rows[0] ?? null);
const books = (q: pg.Client) =>
  q.query("select book_code, chapters_read, chapters_started from public.reading_books()").then((r) => r.rows);

describe("reading progress", () => {
  it("a verse range makes the chapter partly read, and the jump lands after it", () =>
    as(db, { kind: "user", id: alice }, async (q) => {
      expect(await mark(q, 15, 1, 8)).toBe(8);
      expect(await chapter(q, 15)).toEqual({ total: 27, read: 8 });
      expect(await next(q, "JHN", 15)).toEqual({ chapter: 15, verse: 9 });
      // from the book: chapter and verse order, from the first unread verse
      expect(await next(q)).toEqual({ chapter: 1, verse: 1 });
      expect(await books(q)).toEqual([{ book_code: "JHN", chapters_read: 0, chapters_started: 1 }]);
    }));

  it("overlapping and repeated marks count each verse once", () =>
    as(db, { kind: "user", id: alice }, async (q) => {
      await mark(q, 15, 1, 8);
      expect(await mark(q, 15, 5, 10)).toBe(2);
      expect(await mark(q, 15, 1, 8)).toBe(0);
      expect(await chapter(q, 15)).toEqual({ total: 27, read: 10 });
    }));

  it("the whole chapter, or all loose verses, make it read; one verse unread makes it partly read again", () =>
    as(db, { kind: "user", id: alice }, async (q) => {
      await mark(q, 15, 1, 999);
      expect(await chapter(q, 15)).toEqual({ total: 27, read: 27 });
      expect(await books(q)).toEqual([{ book_code: "JHN", chapters_read: 1, chapters_started: 1 }]);
      expect(await mark(q, 15, 5, 5, false)).toBe(1);
      expect(await chapter(q, 15)).toEqual({ total: 27, read: 26 });
      expect(await books(q)).toEqual([{ book_code: "JHN", chapters_read: 0, chapters_started: 1 }]);
      await mark(q, 16, 1, 20);
      await mark(q, 16, 21, 33);
      expect(await chapter(q, 16)).toEqual({ total: 33, read: 33 });
      // undo a whole chapter
      await mark(q, 16, 1, 999, false);
      expect(await chapter(q, 16)).toEqual({ total: 33, read: 0 });
    }));

  it("a fully read book has no next unread verse", () =>
    as(db, { kind: "user", id: alice }, async (q) => {
      await mark(q, 1, 1, 999, true, "OBA"); // Obadja: one chapter
      expect(await next(q, "OBA")).toBeNull();
      expect(await books(q)).toEqual([{ book_code: "OBA", chapters_read: 1, chapters_started: 1 }]);
    }));

  it("is private to its owner", () =>
    as(db, { kind: "user", id: alice }, async (q) => {
      await mark(q, 15, 1, 8);
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await chapter(q, 15)).toEqual({ total: 27, read: 0 });
      expect(await books(q)).toEqual([]);
      expect((await q.query("select count(*)::int as n from public.read_verses")).rows[0].n).toBe(0);
      // bob's undo cannot touch alice's marks
      expect(await mark(q, 15, 1, 8, false)).toBe(0);
    }));

  it("is changed only through the function, and refuses nonsense", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await pgError(q.query("insert into public.read_verses (owner_id, verse_id) select $1, id from public.bible_verses limit 1", [alice]))).toBe(PG.insufficientPrivilege);
    });
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await pgError(mark(q, 15, 8, 1))).toBe("22023");
    });
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await pgError(mark(q, 1, 1, 1, true, "XXX"))).toBe("22023");
    });
    await as(db, { kind: "anon" }, async (q) => {
      expect(await pgError(mark(q, 15, 1, 8))).toBe(PG.insufficientPrivilege);
    });
  });
});
