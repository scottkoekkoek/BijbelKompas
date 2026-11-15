// BK-005, BK-006, AT-08: profiles, preferences and devices are visible only to their owner.
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

describe("signup trigger", () => {
  it("creates a profile and default preferences for a new user", async () => {
    const { rows } = await db.query(
      `select p.user_id, up.ai_enabled, up.auto_analysis, up.theme, up.bible_font_size, up.offline_recent_limit
       from public.profiles p join public.user_preferences up using (user_id) where p.user_id = $1`,
      [alice],
    );
    expect(rows).toEqual([
      { user_id: alice, ai_enabled: false, auto_analysis: false, theme: "system", bible_font_size: 18, offline_recent_limit: 30 },
    ]);
  });
});

describe("owner isolation (AT-08)", () => {
  it("a user sees only their own profile and preferences", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const profiles = await q.query("select user_id from public.profiles");
      expect(profiles.rows).toEqual([{ user_id: alice }]);
      const prefs = await q.query("select user_id from public.user_preferences");
      expect(prefs.rows).toEqual([{ user_id: alice }]);
    });
  });

  it("knowing another user's UUID reveals nothing", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const r1 = await q.query("select * from public.profiles where user_id = $1", [bob]);
      const r2 = await q.query("select * from public.user_preferences where user_id = $1", [bob]);
      expect(r1.rowCount).toBe(0);
      expect(r2.rowCount).toBe(0);
    });
  });

  it("a user cannot change another user's preferences", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const r = await q.query("update public.user_preferences set theme = 'dark' where user_id = $1", [bob]);
      expect(r.rowCount).toBe(0);
    });
    const { rows } = await db.query("select theme from public.user_preferences where user_id = $1", [bob]);
    expect(rows[0].theme).toBe("system");
  });

  it("a user can change their own preferences", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const r = await q.query(
        "update public.user_preferences set theme = 'dark', bible_font_size = 22 where user_id = $1 returning theme, bible_font_size",
        [alice],
      );
      expect(r.rows).toEqual([{ theme: "dark", bible_font_size: 22 }]);
    });
  });

  it("a user cannot move their row to another owner", async () => {
    const code = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(q.query("update public.user_preferences set user_id = $1 where user_id = $2", [bob, alice])),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("a user cannot create or delete profiles", async () => {
    const ins = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(q.query("insert into public.profiles (user_id) values ($1)", [bob])),
    );
    const del = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(q.query("delete from public.profiles where user_id = $1", [alice])),
    );
    expect(ins).toBe(PG.insufficientPrivilege);
    expect(del).toBe(PG.insufficientPrivilege);
  });

  it("an anonymous visitor cannot read anything personal", async () => {
    for (const table of ["profiles", "user_preferences", "devices"]) {
      const code = await as(db, { kind: "anon" }, (q) => pgError(q.query(`select * from public.${table}`)));
      expect(code, table).toBe(PG.insufficientPrivilege);
    }
  });

  it("a user can register a device only for themselves", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const ok = await q.query(
        "insert into public.devices (owner_id, device_label) values ($1, 'Laptop') returning owner_id",
        [alice],
      );
      expect(ok.rows).toEqual([{ owner_id: alice }]);
    });
    const code = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(q.query("insert into public.devices (owner_id, device_label) values ($1, 'Stiekem')", [bob])),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("a soft-deleted profile is hidden from its owner", async () => {
    await db.query("begin");
    try {
      await db.query("update public.profiles set deleted_at = now() where user_id = $1", [bob]);
      await db.query("set local role authenticated");
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: bob, role: "authenticated" })]);
      const r = await db.query("select * from public.profiles");
      expect(r.rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });
});

describe("preference constraints", () => {
  const bad: Array<[string, string]> = [
    ["bible_font_size = 15", "font below 16"],
    ["bible_font_size = 25", "font above 24"],
    ["theme = 'neon'", "unknown theme"],
    ["offline_recent_limit = -1", "negative offline limit"],
    ["editor_preferences = '[]'::jsonb", "editor prefs not an object"],
    ["auto_analysis = true, ai_enabled = false", "auto analysis without AI"],
  ];
  for (const [set, label] of bad) {
    it(`rejects ${label}`, async () => {
      const code = await as(db, { kind: "user", id: alice }, (q) =>
        pgError(q.query(`update public.user_preferences set ${set} where user_id = $1`, [alice])),
      );
      expect(code).toBe(PG.checkViolation);
    });
  }

  it("rejects a default translation that does not exist", async () => {
    const code = await as(db, { kind: "user", id: alice }, (q) =>
      pgError(
        q.query("update public.user_preferences set default_translation_id = gen_random_uuid() where user_id = $1", [alice]),
      ),
    );
    expect(code).toBe(PG.foreignKeyViolation);
  });
});
