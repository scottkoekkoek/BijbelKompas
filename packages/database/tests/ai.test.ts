// Sprint 11: the AI foundation without a provider (BK-041, BK-044, BK-045; AT-10, AT-12, AT-17).
import { randomUUID } from "node:crypto";
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
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() }, content: [{ type: "text", text }] }] });
const newNote = async (q: pg.Client, title: string, text = "tekst") =>
  (await q.query("select id from public.create_note($1, 'vrij', null, $2, 'h')", [title, doc(text)])).rows[0].id as string;
const aiOn = (q: pg.Client, on = true) => q.query("update public.user_preferences set ai_enabled = $1, auto_analysis = false where user_id = auth.uid()", [on]);
const reserve = (q: pg.Client, key: string, estimate = 0.1, note: string | null = null) =>
  q.query("select * from public.ai_reserve('analyse', $1, $2, 'fictief', 'test-1', $3, 1)", [key, estimate, note]);

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

describe("AI budget (BK-044, BK-045, AT-12)", () => {
  it("nothing can be reserved while AI is off", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect((await q.query("select enabled, used_eur::float from public.ai_budget()")).rows[0]).toEqual({ enabled: false, used_eur: 0 });
      expect(await fails(q, "select public.ai_reserve('analyse', 'k', 0.1, 'fictief', 'test-1')")).toBe("42501");
    });
  });

  it("stops new paid work at the safety threshold, counts real costs, and a retry never pays twice", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const a = (await reserve(q, "a", 1)).rows[0];
      expect((await reserve(q, "a", 1)).rows[0].id).toBe(a.id); // same key: same job, no second reservation
      for (const k of ["b", "c", "d"]) await reserve(q, k, 1);
      expect(Number((await q.query("select used_eur from public.ai_budget()")).rows[0].used_eur)).toBe(4);
      expect(await fails(q, "select public.ai_reserve('analyse', 'e', 0.6, 'fictief', 'test-1')")).toBe("53400");

      // the real cost of a was lower: there is room again
      await q.query("select public.ai_finish($1, true, 0.2)", [a.id]);
      expect(Number((await q.query("select used_eur from public.ai_budget()")).rows[0].used_eur)).toBeCloseTo(3.2);
      await reserve(q, "e", 0.6);
      // finishing twice changes nothing
      expect((await q.query("select status, actual_cost_eur::float from public.ai_finish($1, false, 0)", [a.id])).rows[0]).toEqual({ status: "klaar", actual_cost_eur: 0.2 });
      // costs out of range are refused
      expect(await fails(q, "select public.ai_reserve('analyse', 'f', 2, 'fictief', 'test-1')")).toBe("22023");
    });
  });

  it("each owner has an own budget, and the tables cannot be written directly", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const j = (await reserve(q, "x", 0.5)).rows[0];
      expect(await fails(q, "update public.ai_usage set reserved_eur = 0")).toBe("42501");
      expect(await fails(q, "insert into public.ai_jobs (job_type, idempotency_key, provider, model, estimated_cost_eur) values ('analyse','y','p','m',0.1)")).toBe("42501");
      expect(await fails(q, "delete from public.ai_jobs")).toBe("42501");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      await aiOn(q);
      expect((await q.query("select * from public.ai_jobs")).rows).toEqual([]);
      expect(Number((await q.query("select used_eur from public.ai_budget()")).rows[0].used_eur)).toBe(0);
      expect(await fails(q, "select public.ai_finish($1, true, 0)", [j.id])).toBe("42501");
    });
  });
});

describe("AI suggestions (BK-041, AT-10, AT-17)", () => {
  it("only become active when accepted; rejecting leaves both notes untouched", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const source = await newNote(q, "Bron");
      const target = await newNote(q, "Doel");
      const before = (await q.query("select id, document_version, updated_at from public.notes order by id")).rows;
      const job = (await reserve(q, "s1", 0.1, source)).rows[0];
      const n = (await q.query("select public.ai_add_suggestions($1, $2) n", [job.id, JSON.stringify([
        { type: "verband", targetNoteId: target, title: "Zelfde tekst", rationale: "Beide over Genesis 1:1", evidence: [{ noteId: target }] },
        { type: "verband", targetNoteId: source, title: "Naar zichzelf", rationale: "x" }, // dropped
        { type: "verband", targetNoteId: randomUUID(), title: "Bestaat niet", rationale: "x" }, // dropped
        { type: "wis alles", title: "Onbekend", rationale: "x" }, // dropped
      ])])).rows[0].n;
      expect(n).toBe(1);
      const s = (await q.query("select id, status, model_version from public.ai_suggestions")).rows[0];
      expect(s).toMatchObject({ status: "voorgesteld", model_version: "fictief/test-1" });

      const rejected = (await q.query("select status, decided_at is not null as decided from public.ai_decide($1, 'afgewezen')", [s.id])).rows[0];
      expect(rejected).toEqual({ status: "afgewezen", decided: true });
      expect(await fails(q, "select public.ai_decide($1, 'verwijderd')", [s.id])).toBe("22023");
      expect(await fails(q, "update public.ai_suggestions set status = 'geaccepteerd'")).toBe("42501");
      expect((await q.query("select id, document_version, updated_at from public.notes order by id")).rows).toEqual(before);

      // the same link is never proposed again, not even after rejecting
      await q.query("select public.ai_finish($1, true, 0.01)", [job.id]);
      const again = (await reserve(q, "s2", 0.1, target)).rows[0];
      expect((await q.query("select public.ai_add_suggestions($1, $2) n", [again.id, JSON.stringify([{ type: "verband", targetNoteId: source, title: "t", rationale: "r" }])])).rows[0].n).toBe(0);
      // a finished job cannot get more suggestions
      expect(await fails(q, "select public.ai_add_suggestions($1, '[]')", [job.id])).toBe("42501");
    });
  });

  it("can never point at or be decided on by another account (AT-08)", async () => {
    await as(db, { kind: "user", id: bob }, async (q) => {
      await aiOn(q);
      const bobsNote = await newNote(q, "Van Bob");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await aiOn(q);
      const mine = await newNote(q, "Van Alice");
      expect(await fails(q, "select public.ai_reserve('analyse', 'z', 0.1, 'fictief', 'test-1', $1, 1)", [bobsNote])).toBe("42501");
      const job = (await reserve(q, "z2", 0.1, mine)).rows[0];
      expect((await q.query("select public.ai_add_suggestions($1, $2) n", [job.id, JSON.stringify([{ type: "verband", targetNoteId: bobsNote, title: "t", rationale: "r" }])])).rows[0].n).toBe(0);
    });
  });
});
