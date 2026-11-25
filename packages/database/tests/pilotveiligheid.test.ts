// Ronde 4 (ADR-020): pilot safety. Only the server finishes its AI jobs, a running job is not paid
// twice, an account with a recovery link can be deleted, an AI limit per account, and reading
// progress comes back from an export.
import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError } from "./helpers";

let db: pg.Client;
let admin: string;
let alice: string;
let bob: string;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

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
const aiOn = (q: pg.Client) => q.query("update public.user_preferences set ai_enabled = true where user_id = auth.uid()");
const used = async (q: pg.Client) => Number((await q.query("select used_eur from public.ai_budget()")).rows[0].used_eur);

describe("AI jobs: only the server finishes them", () => {
  it("a browser session cannot close a server job at € 0; the server's token can", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const token = randomUUID();
      const job = (await q.query("select * from public.ai_reserve('vraag', 'k1', 0.5, 'claude', 'm', null, null, $1)", [hash(token)])).rows[0];
      expect(await used(q)).toBe(0.5);
      // the same session, without (or with a wrong) token: refused, nothing changes
      expect(await failCode(q, "select public.ai_finish($1, true, 0)", [job.id])).toBe("42501");
      expect(await failCode(q, "select public.ai_finish($1, true, 0, 'fout')", [job.id])).toBe("42501");
      expect(await used(q)).toBe(0.5);
      // the token hash is out of sight
      expect(await failCode(q, "select * from private.ai_job_tokens")).toBe("42501");
      // the server finishes with its token and the real cost
      await q.query("select public.ai_finish($1, true, 0.2, $2)", [job.id, token]);
      expect(await used(q)).toBeCloseTo(0.2);
    });
  });

  it("a second request for a running server job is busy; an abandoned one is closed as failed", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const job = (await q.query("select * from public.ai_reserve('vraag', 'k2', 0.3, 'claude', 'm', null, null, $1)", [hash("a")])).rows[0];
      expect(await failCode(q, "select public.ai_reserve('vraag', 'k2', 0.3, 'claude', 'm', null, null, $1)", [hash("b")])).toBe("55P03");
      // after ten minutes the job counts as failed, at its reserved cost
      await q.query("reset role");
      await q.query("update public.ai_jobs set created_at = now() - interval '11 minutes' where id = $1", [job.id]);
      await q.query("set local role authenticated");
      const again = (await q.query("select * from public.ai_reserve('vraag', 'k2', 0.3, 'claude', 'm', null, null, $1)", [hash("c")])).rows[0];
      expect([again.id, again.status, Number(again.actual_cost_eur)]).toEqual([job.id, "mislukt", 0.3]);
    });
  });
});

describe("AI limit per account", () => {
  it("only an administrator sets it; it replaces the default for that account only", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await failCode(q, "select public.pilot_set_user_ai_limit($1, 50)", [alice])).toBe("42501");
      expect(await failCode(q, "insert into public.ai_user_limits (user_id, limit_eur) values ($1, 50)", [alice])).toBe("42501");
    });
    await as(db, { kind: "user", id: admin }, async (q) => {
      expect(await failCode(q, "select public.pilot_set_user_ai_limit($1, 101)", [alice])).toBe("22023");
      await q.query("select public.pilot_set_user_ai_limit($1, 1)", [alice]);
      const rows = (await q.query("select user_id, ai_limit_eur from public.pilot_accounts() where user_id in ($1, $2)", [alice, bob])).rows;
      expect(Object.fromEntries(rows.map((r) => [r.user_id, r.ai_limit_eur === null ? null : Number(r.ai_limit_eur)]))).toEqual({ [alice]: 1, [bob]: null });

      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await aiOn(q);
      const b = (await q.query("select * from public.ai_budget()")).rows[0];
      expect([Number(b.limit_eur), Number(b.stop_at_eur)]).toEqual([1, 0.9]);
      await q.query("select public.ai_reserve('vraag', 'l1', 0.8, 'claude', 'm')");
      expect(await failCode(q, "select public.ai_reserve('vraag', 'l2', 0.2, 'claude', 'm')")).toBe("53400");
      // alice sees only her own limit
      expect((await q.query("select user_id from public.ai_user_limits")).rows).toEqual([{ user_id: alice }]);

      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.ai_user_limits")).rows).toEqual([]);
      const def = Number((await q.query("select ai_user_limit_eur from public.app_settings")).rows[0].ai_user_limit_eur);
      expect(Number((await q.query("select limit_eur from public.ai_budget()")).rows[0].limit_eur)).toBe(def);

      // removing the own limit brings back the default
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: admin, role: "authenticated" })]);
      await q.query("select public.pilot_set_user_ai_limit($1, null)", [alice]);
      expect((await q.query("select count(*)::int c from public.ai_user_limits where user_id = $1", [alice])).rows[0].c).toBe(0);
    });
  });
});

describe("deleting an account", () => {
  it("works with an open recovery link; the link is closed and the invitation history stays", async () => {
    const gone = await createUser(db);
    const inv = (await db.query(
      `insert into public.pilot_invitations (kind, email, token_hash, created_by, expires_at, user_id)
       values ('uitnodiging', 'weg@example.test', $1, $2, now() + interval '7 days', $3),
              ('herstel', 'weg@example.test', $4, $2, now() + interval '2 days', $3) returning id, kind`,
      [hash(randomUUID()), admin, gone, hash(randomUUID())],
    )).rows;
    await db.query("update public.pilot_invitations set used_at = now() where id = $1", [inv.find((i) => i.kind === "uitnodiging").id]);
    await deleteUser(db, gone);
    const after = (await db.query("select kind, user_id, revoked_at from public.pilot_invitations where id = any($1)", [inv.map((i) => i.id)])).rows;
    expect(after).toHaveLength(2);
    expect(after.every((r) => r.user_id === null)).toBe(true);
    expect(after.find((r) => r.kind === "herstel").revoked_at).not.toBeNull();
    await db.query("delete from public.pilot_invitations where id = any($1)", [inv.map((i) => i.id)]);
  });

  it("deleting an administrator keeps the links they made", async () => {
    const other = await createUser(db);
    await db.query("insert into public.app_admins (user_id) values ($1)", [other]);
    const id = (await db.query(
      "insert into public.pilot_invitations (email, token_hash, created_by, expires_at) values ('x@example.test', $1, $2, now() + interval '1 day') returning id",
      [hash(randomUUID()), other],
    )).rows[0].id;
    await deleteUser(db, other);
    expect((await db.query("select created_by from public.pilot_invitations where id = $1", [id])).rows).toEqual([{ created_by: null }]);
    await db.query("delete from public.pilot_invitations where id = $1", [id]);
  });
});

describe("reading progress in an export", () => {
  it("comes back by canonical verse, only for the signed-in owner, without duplicates", async () => {
    await as(db, { kind: "user", id: bob }, async (q) => {
      const n = (await q.query("select public.import_read_verses($1) n", [JSON.stringify(["GEN.1.1", "GEN.1.2", "GEN.1.2", "XXX.1.1", "GEN.999.1"])])).rows[0].n;
      expect(n).toBe(2);
      expect((await q.query("select public.import_read_verses($1) n", [JSON.stringify(["GEN.1.1"])])).rows[0].n).toBe(0);
      expect((await q.query("select count(*)::int c from public.read_verses")).rows[0].c).toBe(2);
      expect(await failCode(q, "select public.import_read_verses('{}'::jsonb)")).toBe("22023");
    });
    await as(db, { kind: "anon" }, async (q) => {
      expect(await failCode(q, "select public.import_read_verses('[]'::jsonb)")).toBe("42501");
    });
  });
});
