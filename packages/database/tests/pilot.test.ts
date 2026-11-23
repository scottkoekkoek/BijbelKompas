// Ronde 3 §6: the closed pilot. Links only from administrators, used once, before they expire and
// only when not revoked; redeeming only by the server's secret key; and every personal table keeps
// one owner's rows away from everyone else.
import { createHash } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError } from "./helpers";

let db: pg.Client;
let admin: string;
let tester: string;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

beforeAll(async () => {
  db = client();
  await db.connect();
  admin = await createUser(db);
  tester = await createUser(db);
  await db.query("insert into public.app_admins (user_id) values ($1)", [admin]);
});
afterAll(async () => {
  await db.query("delete from public.pilot_invitations where created_by = $1", [admin]);
  await deleteUser(db, admin);
  await deleteUser(db, tester);
  await db.end();
});

async function failCode(q: pg.Client, sql: string, params: unknown[] = []) {
  await q.query("savepoint f");
  const code = await pgError(q.query(sql, params));
  await q.query("rollback to savepoint f");
  return code;
}

describe("besloten pilot", () => {
  it("only an administrator makes or revokes links and sees them", async () => {
    await as(db, { kind: "user", id: tester }, async (q) => {
      expect(await failCode(q, "select public.pilot_create_invitation('x@example.test', 7, $1)", [hash("t0")])).toBe("42501");
      expect(await failCode(q, "select * from public.pilot_accounts()")).toBe("42501");
      expect((await q.query("select public.is_app_admin() as a")).rows[0].a).toBe(false);
      // nobody can make themselves an administrator
      expect(await failCode(q, "insert into public.app_admins (user_id) values ($1)", [tester])).toBe("42501");
    });
    await as(db, { kind: "user", id: admin }, async (q) => {
      const i = (await q.query("select * from public.pilot_create_invitation(' Nieuw@Example.test ', 7, $1)", [hash("t1")])).rows[0];
      expect(i.email).toBe("nieuw@example.test");
      expect((await q.query("select count(*)::int as c from public.pilot_invitations")).rows[0].c).toBeGreaterThan(0);
      // a second link for the same address replaces (revokes) the first
      await q.query("select public.pilot_create_invitation('nieuw@example.test', 7, $1)", [hash("t2")]);
      expect((await q.query("select revoked_at from public.pilot_invitations where id = $1", [i.id])).rows[0].revoked_at).not.toBeNull();
      expect(await failCode(q, "select public.pilot_create_invitation('n@example.test', 31, $1)", [hash("t3")])).toBe("22023");
    });
    await as(db, { kind: "user", id: tester }, async (q) => {
      expect((await q.query("select * from public.pilot_invitations")).rows).toHaveLength(0);
    });
  });

  it("a link works once, for its own address, and not when expired or revoked", async () => {
    await db.query(
      `insert into public.pilot_invitations (email, token_hash, created_by, created_at, expires_at) values
         ('open@example.test', $1, $4, now(), now() + interval '1 day'),
         ('oud@example.test', $2, $4, now() - interval '3 days', now() - interval '1 day'),
         ('weg@example.test', $3, $4, now(), now() + interval '1 day')`,
      [hash("open"), hash("oud"), hash("weg"), admin],
    );
    await db.query("update public.pilot_invitations set revoked_at = now() where token_hash = $1", [hash("weg")]);
    // browsers (signed in or not) cannot redeem at all
    for (const role of [{ kind: "anon" } as const, { kind: "user", id: tester } as const]) {
      await as(db, role, async (q) => {
        expect(await failCode(q, "select public.pilot_claim_invitation($1, 'open@example.test')", [hash("open")])).toBe("42501");
        expect(await failCode(q, "select public.pilot_invitation_state($1)", [hash("open")])).toBe("42501");
      });
    }
    await as(db, { kind: "service" }, async (q) => {
      expect((await q.query("select public.pilot_invitation_state($1) as s", [hash("oud")])).rows[0].s).toBe("verlopen");
      expect((await q.query("select public.pilot_invitation_state($1) as s", [hash("weg")])).rows[0].s).toBe("ingetrokken");
      expect((await q.query("select public.pilot_invitation_state($1) as s", [hash("nergens")])).rows[0].s).toBe("onbekend");
      expect(await failCode(q, "select public.pilot_claim_invitation($1, 'ander@example.test')", [hash("open")])).toBe("42501");
      expect(await failCode(q, "select public.pilot_claim_invitation($1, 'oud@example.test')", [hash("oud")])).toBe("42501");
      expect(await failCode(q, "select public.pilot_claim_invitation($1, 'weg@example.test')", [hash("weg")])).toBe("42501");
      const ok = (await q.query("select * from public.pilot_claim_invitation($1, 'OPEN@example.test')", [hash("open")])).rows[0];
      expect(ok.used_at).not.toBeNull();
      expect(await failCode(q, "select public.pilot_claim_invitation($1, 'open@example.test')", [hash("open")])).toBe("42501");
      // a failed account creation gives the link back
      await q.query("select public.pilot_finish_invitation($1, null)", [ok.id]);
      expect((await q.query("select public.pilot_invitation_state($1) as s", [hash("open")])).rows[0].s).toBe("uitnodiging");
    });
  });

  it("every personal table keeps another account's rows out of sight", async () => {
    // all tables with an owner column: none of them shows the administrator's rows to the tester
    const { rows: tables } = await db.query(
      `select table_name from information_schema.columns where table_schema = 'public' and column_name = 'owner_id'`,
    );
    expect(tables.length).toBeGreaterThan(15);
    await as(db, { kind: "user", id: admin }, async (q) => {
      await q.query("select public.create_note('Van de beheerder', 'vrij', null, $1, 'h')", [JSON.stringify({ type: "doc", content: [] })]);
      await q.query("savepoint s");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: tester, role: "authenticated" })]);
      for (const t of tables) {
        const r = await q.query(`select count(*)::int as c from public.${t.table_name} where owner_id <> $1`, [tester]);
        expect(r.rows[0].c, t.table_name).toBe(0);
      }
      for (const t of ["user_preferences", "profiles"]) {
        const r = await q.query(`select count(*)::int as c from public.${t} where user_id <> $1`, [tester]);
        expect(r.rows[0].c, t).toBe(0);
      }
    });
  });
});
