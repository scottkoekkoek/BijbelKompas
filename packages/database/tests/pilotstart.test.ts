// Ronde 4 (ADR-020), pilot start: feedback stays between the tester and the administrator, the
// welcome can be closed for good, and deleting an account leaves nothing personal behind.
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError } from "./helpers";

let db: pg.Client;
let admin: string;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = client();
  await db.connect();
  admin = await createUser(db);
  alice = await createUser(db);
  bob = await createUser(db);
  await db.query("insert into public.app_admins (user_id) values ($1)", [admin]);
});
afterAll(async () => {
  for (const u of [admin, alice, bob]) await deleteUser(db, u);
  await db.end();
});

async function failCode(q: pg.Client, sql: string, params: unknown[] = []) {
  await q.query("savepoint f");
  const code = await pgError(q.query(sql, params));
  await q.query("rollback to savepoint f");
  return code;
}

describe("feedback", () => {
  it("a tester writes and sees only their own; the administrator sees all of it with the sender", async () => {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      const claims = (id: string) => db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
      await claims(alice);
      await db.query("insert into public.feedback (message, page, viewport) values ('De knop is te klein', '/bible/JHN/3', '412x915')");
      // not in someone else's name, not empty, no full URL as page
      expect(await failCode(db, "insert into public.feedback (owner_id, message) values ($1, 'x')", [bob])).toBe("42501");
      expect(await failCode(db, "insert into public.feedback (message) values ('   ')")).toBe("23514");
      expect(await failCode(db, "insert into public.feedback (message, page) values ('x', 'https://elders.test')")).toBe("23514");
      expect(await failCode(db, "select * from public.pilot_feedback()")).toBe("42501");
      expect(await failCode(db, "update public.feedback set message = 'anders'")).toBe("42501");

      await claims(bob);
      expect((await db.query("select count(*)::int c from public.feedback")).rows[0].c).toBe(0);

      await claims(admin);
      const rows = (await db.query("select email, message, page, viewport from public.pilot_feedback()")).rows;
      const mine = rows.find((r) => r.message === "De knop is te klein");
      expect(mine).toMatchObject({ page: "/bible/JHN/3", viewport: "412x915" });
      expect(mine.email).toMatch(/@example\.test$/);
    } finally {
      await db.query("rollback");
    }
  });

  it("visitors who are not signed in cannot send or read feedback", async () => {
    await as(db, { kind: "anon" }, async (q) => {
      expect(await failCode(q, "insert into public.feedback (message) values ('x')")).toBe("42501");
      expect(await failCode(q, "select * from public.feedback")).toBe("42501");
    });
  });
});

describe("welcome", () => {
  it("the owner closes it for good; only that column can be changed this way", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("update public.user_preferences set welcome_dismissed_at = now() where user_id = auth.uid()");
      expect((await q.query("select welcome_dismissed_at from public.user_preferences")).rows[0].welcome_dismissed_at).not.toBeNull();
    });
  });
});

describe("deleting an account", () => {
  it("leaves no personal row in any table", async () => {
    const gone = await createUser(db);
    // a little of everything, written as the user
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: gone, role: "authenticated" })]);
    await db.query("insert into public.feedback (message) values ('tot ziens')");
    await db.query("update public.user_preferences set welcome_dismissed_at = now() where user_id = auth.uid()");
    await db.query("select public.import_read_verses($1)", [JSON.stringify(["GEN.1.1"])]);
    await db.query("commit");

    // every public table with an owner column
    const tables = (await db.query(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and column_name in ('owner_id', 'user_id')
         and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')`,
    )).rows as { table_name: string; column_name: string }[];
    expect(tables.length).toBeGreaterThan(10);
    const count = async () => {
      let n = 0;
      for (const t of tables) n += (await db.query(`select count(*)::int c from public.${t.table_name} where ${t.column_name} = $1`, [gone])).rows[0].c;
      return n;
    };
    expect(await count()).toBeGreaterThan(0);
    await deleteUser(db, gone);
    expect(await count()).toBe(0);
  });

  it("knows when the account is the only administrator", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect((await q.query("select public.pilot_is_last_admin() v")).rows[0].v).toBe(false);
    });
    const others = (await db.query("select count(*)::int c from public.app_admins")).rows[0].c;
    await as(db, { kind: "user", id: admin }, async (q) => {
      expect((await q.query("select public.pilot_is_last_admin() v")).rows[0].v).toBe(others === 1);
    });
  });
});
