// Ronde 3 §4 + §6: model choice per account and the shared pilot budget. Budgets run per month,
// whatever model is used; only an admin changes the limits; 90% of either limit stops new work.
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
  await db.query("update public.user_preferences set ai_enabled = true where user_id in ($1, $2)", [alice, bob]);
});
afterAll(async () => {
  await deleteUser(db, alice);
  await deleteUser(db, bob);
  await db.end();
});

async function switchTo(q: pg.Client, user: string) {
  await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
}

describe("AI-modelkeuze en pilotbudget", () => {
  it("keeps the familiar defaults: €5 per account (stop at €4,50) and a shared pilot budget", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const b = (await q.query("select * from public.ai_budget()")).rows[0];
      expect(Number(b.limit_eur)).toBe(5);
      expect(Number(b.stop_at_eur)).toBe(4.5);
      expect(Number(b.pilot_limit_eur)).toBe(25);
      expect(Number(b.pilot_stop_at_eur)).toBe(22.5);
      expect(b.enabled).toBe(true);
    });
    await as(db, { kind: "anon" }, async (q) => {
      expect(await pgError(q.query("select * from public.ai_budget()"))).toBe("42501");
    });
  });

  it("stores the chosen model per account, with a checked format", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("update public.user_preferences set ai_model = 'claude-haiku-5-5' where user_id = $1", [alice]);
      expect((await q.query("select ai_model from public.user_preferences")).rows).toEqual([{ ai_model: "claude-haiku-5-5" }]);
      await q.query("savepoint s");
      expect(await pgError(q.query("update public.user_preferences set ai_model = 'Robert''); drop' where user_id = $1", [alice]))).toBe("23514");
      await q.query("rollback to savepoint s");
      // bob cannot change alice's choice
      await switchTo(q, bob);
      const r = await q.query("update public.user_preferences set ai_model = 'x' where user_id = $1", [alice]);
      expect(r.rowCount).toBe(0);
    });
  });

  it("only lets an admin change the limits", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("savepoint r");
      expect(await pgError(q.query("select public.pilot_set_ai_budget(10, 50)"))).toBe("42501");
      await q.query("rollback to savepoint r");
      await q.query("savepoint s");
      expect(await pgError(q.query("update public.app_settings set ai_user_limit_eur = 100"))).toBe("42501");
      await q.query("rollback to savepoint s");
      await q.query("reset role");
      await q.query("insert into public.app_admins (user_id) values ($1) on conflict do nothing", [alice]);
      await q.query("set local role authenticated");
      await q.query("savepoint t");
      expect(await pgError(q.query("select public.pilot_set_ai_budget(-1, 50)"))).toBe("22023");
      await q.query("rollback to savepoint t");
      const s = (await q.query("select * from public.pilot_set_ai_budget(10, 50)")).rows[0];
      expect([Number(s.ai_user_limit_eur), Number(s.ai_pilot_limit_eur)]).toEqual([10, 50]);
      const b = (await q.query("select * from public.ai_budget()")).rows[0];
      expect([Number(b.stop_at_eur), Number(b.pilot_stop_at_eur)]).toEqual([9, 45]);
    });
  });

  it("stops at 90% of the account budget and of the shared budget, across model changes", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await q.query("reset role");
      await q.query("update public.app_settings set ai_user_limit_eur = 1, ai_pilot_limit_eur = 1000");
      await q.query("set local role authenticated");
      // two models, one budget
      await q.query("select public.ai_reserve('vraag', 'a1', 0.5, 'claude', 'claude-opus-5-5')");
      await q.query("select public.ai_reserve('vraag', 'a2', 0.3, 'claude', 'claude-haiku-5-5')");
      await q.query("savepoint s");
      await expect(q.query("select public.ai_reserve('vraag', 'a3', 0.2, 'claude', 'claude-sonnet-5-5')")).rejects.toMatchObject({ code: "53400", message: "AI budget reached" });
      await q.query("rollback to savepoint s");

      // the whole pilot: bob still has room himself, but the shared budget is (nearly) used
      const used = Number((await q.query("select pilot_used_eur from public.ai_budget()")).rows[0].pilot_used_eur);
      await q.query("reset role");
      await q.query("update public.app_settings set ai_user_limit_eur = 100, ai_pilot_limit_eur = $1", [Math.ceil(((used + 0.1) / 0.9) * 100) / 100]);
      await q.query("set local role authenticated");
      await switchTo(q, bob);
      await q.query("savepoint t");
      await expect(q.query("select public.ai_reserve('vraag', 'b1', 0.5, 'claude', 'claude-haiku-5-5')")).rejects.toMatchObject({ code: "53400", message: "AI pilot budget reached" });
      await q.query("rollback to savepoint t");
      // bob's own budget shows only his usage; the pilot total is one number
      const b = (await q.query("select * from public.ai_budget()")).rows[0];
      expect(Number(b.used_eur)).toBe(0);
      expect(Number(b.pilot_used_eur)).toBeCloseTo(used);
    });
  });
});
