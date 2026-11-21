// Sprint 11/12: the AI foundation without a provider (BK-041..BK-046; AT-10, AT-11, AT-12, AT-17).
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

/** Saves new text for a note through save_note, as the app does. */
async function setText(q: pg.Client, id: string, text: string) {
  const n = (await q.query("select document_version from public.notes where id = $1", [id])).rows[0];
  const blockId = randomUUID();
  const d = { type: "doc", content: [{ type: "paragraph", attrs: { blockId }, content: [{ type: "text", text }] }] };
  await q.query(
    "select public.save_note($1, $2, 'Titel', 'vrij', null, $3, $4, $5, '[]'::jsonb, null, null, null)",
    [id, n.document_version, JSON.stringify(d), `h-${text}`, JSON.stringify([{ block_id: blockId, block_type: "paragraph", plain_text: text, position: 0, content_hash: `b-${text}` }])],
  );
  return blockId;
}

describe("outdated suggestions (BK-046)", () => {
  it("are flagged when a note changes, and a new analysis may propose the link again", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const source = await newNote(q, "Bron 46");
      const target = await newNote(q, "Doel 46");
      const job = (await reserve(q, "o1", 0.01, source)).rows[0];
      await q.query("select public.ai_add_suggestions($1, $2)", [job.id, JSON.stringify([{ type: "verband", targetNoteId: target, title: "t", rationale: "r" }])]);
      await q.query("select public.ai_finish($1, true, 0.001)", [job.id]);
      const stale = async () => (await q.query("select status, stale from public.ai_note_suggestions($1)", [source])).rows;
      expect(await stale()).toEqual([{ status: "voorgesteld", stale: false }]);

      await setText(q, target, "Nieuwe tekst in het doel");
      expect(await stale()).toEqual([{ status: "voorgesteld", stale: true }]);

      // a new analysis marks the old one as outdated and may propose the same link again
      const again = (await reserve(q, "o2", 0.01, source)).rows[0];
      expect((await q.query("select public.ai_add_suggestions($1, $2) n", [again.id, JSON.stringify([{ type: "verband", targetNoteId: target, title: "t", rationale: "r" }])])).rows[0].n).toBe(1);
      expect((await q.query("select status, stale from public.ai_note_suggestions($1) order by created_at", [source])).rows.map((r) => r.status).sort()).toEqual(["verouderd", "voorgesteld"]);

      // an accepted link is never re-proposed or marked outdated by the system
      const fresh = (await q.query("select id from public.ai_suggestions where status = 'voorgesteld' and source_note_id = $1", [source])).rows[0].id;
      await q.query("select public.ai_decide($1, 'geaccepteerd')", [fresh]);
      await q.query("select public.ai_finish($1, true, 0.001)", [again.id]);
      await setText(q, source, "Weer anders");
      const third = (await reserve(q, "o3", 0.01, source)).rows[0];
      expect((await q.query("select public.ai_add_suggestions($1, $2) n", [third.id, JSON.stringify([{ type: "verband", targetNoteId: target, title: "t", rationale: "r" }])])).rows[0].n).toBe(0);
      expect((await q.query("select status from public.ai_suggestions where id = $1", [fresh])).rows[0].status).toBe("geaccepteerd");
      expect(await fails(q, "select public.ai_decide($1, 'verouderd')", [fresh])).toBe("22023");
    });
  });
});

describe("questions to your notes (BK-042, BK-043, AT-11)", () => {
  it("only finds the owner's own blocks, and only keeps sources that literally quote them", async () => {
    await as(db, { kind: "user", id: bob }, async (q) => {
      const bobsNote = await newNote(q, "Van Bob");
      const bobsBlock = await setText(q, bobsNote, "Zondvloed bij Bob. Geheim.");
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: alice, role: "authenticated" })]);
      await aiOn(q);
      const mine = await newNote(q, "Over de zondvloed");
      const block = await setText(q, mine, "De zondvloed laat Gods geduld zien. Noach bouwde de ark.");
      const found = (await q.query("select note_id, block_id from public.ai_fragments('zondvloed')")).rows;
      expect(found).toEqual([{ note_id: mine, block_id: block }]);

      const job = (await q.query("select * from public.ai_reserve('vraag', 'v1', 0.01, 'fictief', 'test-1')")).rows[0];
      const a = (await q.query("select * from public.ai_add_answer($1, 'Wat over de zondvloed?', 'Antwoord', false, $2)", [job.id, JSON.stringify([
        { noteId: mine, blockId: block, quote: "De zondvloed laat Gods geduld zien." },
        { noteId: mine, blockId: block, quote: "De zondvloed laat Gods geduld zien." }, // twice
        { noteId: mine, blockId: block, quote: "Een citaat dat er niet staat." },
        { noteId: mine, blockId: randomUUID(), quote: "Noach" }, // block does not exist
        { noteId: bobsNote, blockId: bobsBlock, quote: "Zondvloed bij Bob." }, // another account
      ])])).rows[0];
      expect(a.uncertain).toBe(false);
      expect(a.sources).toEqual([{ noteId: mine, blockId: block, revision: expect.any(Number), blockHash: expect.any(String), quote: "De zondvloed laat Gods geduld zien." }]);
      // the job is no longer open for a second answer, once finished
      await q.query("select public.ai_finish($1, true, 0.001)", [job.id]);
      expect(await fails(q, "select public.ai_add_answer($1, 'v', 'a', false, '[]')", [job.id])).toBe("42501");
    });
  });

  it("without a checked source the answer is uncertain and the provider's text is not kept (AT-11)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const job = (await q.query("select * from public.ai_reserve('vraag', 'v2', 0.01, 'fictief', 'test-1')")).rows[0];
      const a = (await q.query("select * from public.ai_add_answer($1, 'Wat zei Paulus over X?', 'Paulus zei Y (bron: Preek 3).', false, $2)", [job.id, JSON.stringify([{ noteId: randomUUID(), blockId: randomUUID(), quote: "Paulus zei Y" }])])).rows[0];
      expect(a).toMatchObject({ uncertain: true, sources: [] });
      expect(a.answer).not.toContain("Paulus zei Y");
      // the table itself cannot be written, and an analysis job cannot hold an answer
      expect(await fails(q, "insert into public.ai_answers (owner_id, job_id, question, answer, uncertain, model_version) values (auth.uid(), $1, 'v', 'a', true, 'm')", [job.id])).toBe("42501");
      const analyse = (await reserve(q, "v3", 0.01)).rows[0];
      expect(await fails(q, "select public.ai_add_answer($1, 'vraag', 'a', false, '[]')", [analyse.id])).toBe("42501");
    });
    await as(db, { kind: "user", id: bob }, async (q) => {
      expect((await q.query("select * from public.ai_answers")).rows).toEqual([]);
    });
  });
});

describe("AI-uitleg bij verzen (ADR-017)", () => {
  const explain = (q: pg.Client, job: string, translation: string, keys: string[], cross: unknown = []) =>
    q.query("select * from public.ai_add_explanation($1, $2, $3, 'Genesis 1:1-2', 'Uitleg', $4)", [job, translation, keys, JSON.stringify(cross)]);

  it("HSV and NBV21 can never be sent to AI; the test text can", async () => {
    const { rows } = await db.query("select code, ai_processing_allowed from public.bible_translations where code in ('HSV', 'NBV21', 'TEST', 'TEST2') order by code");
    expect(rows).toEqual([
      { code: "HSV", ai_processing_allowed: false },
      { code: "NBV21", ai_processing_allowed: false },
      { code: "TEST", ai_processing_allowed: true },
      { code: "TEST2", ai_processing_allowed: false },
    ]);
    await db.query("begin");
    try {
      expect(await fails(db, "update public.bible_translations set ai_processing_allowed = true where code = 'HSV'")).toBe("23514");
    } finally {
      await db.query("rollback");
    }
  });

  it("stores an explanation only for an open uitleg job, existing verses and an allowed translation", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const job = (await q.query("select * from public.ai_reserve('uitleg', 'u1', 0.01, 'fictief', 'test-1')")).rows[0];
      expect(await fails(q, "select public.ai_add_explanation($1, 'TEST2', '{GEN.1.1}', 'l', 'u', '[]')", [job.id])).toBe("42501");
      expect(await fails(q, "select public.ai_add_explanation($1, 'TEST', '{GEN.1.1,GEN.9.9}', 'l', 'u', '[]')", [job.id])).toBe("22023");
      const e = (await explain(q, job.id, "TEST", ["GEN.1.1", "GEN.1.2"], [{ reference: "Johannes 1:1", reason: "Ook 'in het begin'." }, "los", { reason: "zonder verwijzing" }])).rows[0];
      expect(e).toMatchObject({ translation_code: "TEST", segment_keys: ["GEN.1.1", "GEN.1.2"], model_version: "fictief/test-1" });
      expect(e.cross_references).toEqual([{ reference: "Johannes 1:1", reason: "Ook 'in het begin'." }]);
      await q.query("select public.ai_finish($1, true, 0.001)", [job.id]);
      expect(await fails(q, "select public.ai_add_explanation($1, 'TEST', '{GEN.1.1}', 'l', 'u', '[]')", [job.id])).toBe("42501");
      const vraag = (await q.query("select * from public.ai_reserve('vraag', 'u2', 0.01, 'fictief', 'test-1')")).rows[0];
      expect(await fails(q, "select public.ai_add_explanation($1, 'TEST', '{GEN.1.1}', 'l', 'u', '[]')", [vraag.id])).toBe("42501");
      expect(await fails(q, "insert into public.ai_explanations (owner_id, job_id, translation_code, segment_keys, passage_label, explanation, model_version) values (auth.uid(), $1, 'TEST', '{GEN.1.1}', 'l', 'u', 'm')", [vraag.id])).toBe("42501");
    });
    await as(db, { kind: "user", id: bob }, async (q) => {
      expect((await q.query("select * from public.ai_explanations")).rows).toEqual([]);
    });
  });
});

describe("AI-opzet van een notitie (ADR-018)", () => {
  it("stores an outline only for an open opzet job of the owner's own note, and cleans the points", async () => {
    let jobId = "";
    await as(db, { kind: "user", id: alice }, async (q) => {
      await aiOn(q);
      const note = await newNote(q, "Preek over Noach", "God is geduldig.");
      const job = (await q.query("select * from public.ai_reserve('opzet', 'o1', 0.01, 'fictief', 'test-1', $1, 1)", [note])).rows[0];
      jobId = job.id;
      const o = (await q.query("select * from public.ai_add_outline($1, 'Samenvatting', 'Kern', $2, 'Toepassing')", [job.id, JSON.stringify([
        { heading: "Eén", details: ["a", "", 3, "b"] },
        { heading: " ", details: ["weg"] },
        "los",
      ])])).rows[0];
      expect(o).toMatchObject({ note_id: note, summary: "Samenvatting", main_thought: "Kern", application: "Toepassing", model_version: "fictief/test-1" });
      expect(o.points).toEqual([{ heading: "Eén", details: ["a", "b"] }]);
      expect(o.content_hash).not.toBe("");
      // the note itself is untouched
      expect((await q.query("select title from public.notes where id = $1", [note])).rows[0].title).toBe("Preek over Noach");
      await q.query("select public.ai_finish($1, true, 0.001)", [job.id]);
      expect(await fails(q, "select public.ai_add_outline($1, 's', 'k', '[]', '')", [job.id])).toBe("42501");
      const vraag = (await q.query("select * from public.ai_reserve('vraag', 'o2', 0.01, 'fictief', 'test-1')")).rows[0];
      expect(await fails(q, "select public.ai_add_outline($1, 's', 'k', '[]', '')", [vraag.id])).toBe("42501");
      expect(await fails(q, "insert into public.ai_outlines (owner_id, job_id, note_id, source_revision, content_hash, summary, main_thought, model_version) values (auth.uid(), $1, $2, 1, 'h', 's', 'k', 'm')", [vraag.id, note])).toBe("42501");
    });
    await as(db, { kind: "user", id: bob }, async (q) => {
      expect((await q.query("select * from public.ai_outlines")).rows).toEqual([]);
      expect(await fails(q, "select public.ai_add_outline($1, 's', 'k', '[]', '')", [jobId])).toBe("42501");
    });
  });
});
