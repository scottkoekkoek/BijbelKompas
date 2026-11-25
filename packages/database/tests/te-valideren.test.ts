// Ronde 4 (ADR-020): data of the features to validate. Toepassingen (B4) and the reading plan (C2)
// are personal, and gespreksvragen (D1) can only be stored for an open job of the right kind.
import { randomUUID } from "node:crypto";
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
});
afterAll(async () => {
  for (const u of [alice, bob]) await deleteUser(db, u);
  await db.end();
});

async function failCode(q: pg.Client, sql: string, params: unknown[] = []) {
  await q.query("savepoint f");
  const code = await pgError(q.query(sql, params));
  await q.query("rollback to savepoint f");
  return code;
}
const doc = () => JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() } }] });
const newNote = async (q: pg.Client) =>
  (await q.query("select id from public.create_note('Preek', 'preek', null, $1::jsonb, 'nieuw')", [doc()])).rows[0].id as string;
const claims = (q: pg.Client, id: string) => q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);

describe("toepassingen (B4)", () => {
  it("only on your own notes; nobody else sees or changes them", async () => {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await claims(db, bob);
      const bobs = await newNote(db);
      await claims(db, alice);
      const mine = await newNote(db);
      const block = randomUUID();
      await db.query("insert into public.application_reviews (note_id, block_id) values ($1, $2)", [mine, block]);
      await db.query("update public.application_reviews set status = 'gedaan', reflection = 'Gebeld.' where note_id = $1", [mine]);
      expect(await failCode(db, "insert into public.application_reviews (note_id, block_id) values ($1, $2)", [bobs, randomUUID()])).toBe("42501");
      expect(await failCode(db, "update public.application_reviews set status = 'klaar' where note_id = $1", [mine])).toBe("23514");
      expect(await failCode(db, "update public.application_reviews set owner_id = $1", [bob])).toBe("42501");

      await claims(db, bob);
      expect((await db.query("select count(*)::int c from public.application_reviews")).rows[0].c).toBe(0);
      await db.query("update public.application_reviews set status = 'open'");
      await claims(db, alice);
      expect((await db.query("select status from public.application_reviews where note_id = $1", [mine])).rows[0].status).toBe("gedaan");
    } finally {
      await db.query("rollback");
    }
  });
});

describe("reading plan (C2)", () => {
  it("one plan per account, only your own", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("insert into public.reading_plans (plan_key, started_on) values ('nt90', '2026-11-01')");
      expect(await failCode(q, "insert into public.reading_plans (plan_key) values ('psalmen-spreuken')")).toBe("23505");
      expect(await failCode(q, "insert into public.reading_plans (owner_id, plan_key) values ($1, 'nt90')", [bob])).toBe("42501");
      expect(await failCode(q, "update public.reading_plans set days_done = -1")).toBe("23514");
      expect(await failCode(q, "update public.reading_plans set plan_key = 'ander'")).toBe("42501");
      await q.query("update public.reading_plans set days_done = days_done + 1");
      expect((await q.query("select days_done from public.reading_plans")).rows[0].days_done).toBe(1);
      // another plan starts over; stopping goes through the function (no direct delete)
      await q.query("select public.reading_plan_start('psalmen-spreuken', '2026-11-24')");
      expect((await q.query("select plan_key, days_done from public.reading_plans")).rows[0]).toEqual({ plan_key: "psalmen-spreuken", days_done: 0 });
      expect(await failCode(q, "delete from public.reading_plans")).toBe("42501");
      await q.query("select public.reading_plan_stop()");
      expect((await q.query("select count(*)::int c from public.reading_plans")).rows[0].c).toBe(0);
    });
    await as(db, { kind: "user", id: bob }, async (q) => {
      expect((await q.query("select count(*)::int c from public.reading_plans")).rows[0].c).toBe(0);
    });
    await as(db, { kind: "anon" }, async (q) => {
      expect(await failCode(q, "select * from public.reading_plans")).toBe("42501");
    });
  });
});

describe("gespreksvragen (D1)", () => {
  it("are stored only for an open job of that kind, never empty", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("update public.user_preferences set ai_enabled = true where user_id = auth.uid()");
      const note = await newNote(q);
      const wrong = (await q.query("select * from public.ai_reserve('opzet', 'd0', 0.01, 'fictief', 'm', $1, 1)", [note])).rows[0];
      expect(await failCode(q, "select public.ai_add_discussion($1, '[\"x\"]'::jsonb)", [wrong.id])).toBe("42501");
      const job = (await q.query("select * from public.ai_reserve('gespreksvragen', 'd1', 0.01, 'fictief', 'm', $1, 1)", [note])).rows[0];
      expect(await failCode(q, "select public.ai_add_discussion($1, '[\"  \", 3]'::jsonb)", [job.id])).toBe("22023");
      const r = (await q.query("select questions from public.ai_add_discussion($1, $2::jsonb)", [job.id, JSON.stringify(["Wat raakte je?", "Wat doe je ermee?"])])).rows[0];
      expect(r.questions).toEqual(["Wat raakte je?", "Wat doe je ermee?"]);
    });
    await as(db, { kind: "user", id: bob }, async (q) => {
      expect((await q.query("select count(*)::int c from public.ai_discussion_questions")).rows[0].c).toBe(0);
    });
  });
});
