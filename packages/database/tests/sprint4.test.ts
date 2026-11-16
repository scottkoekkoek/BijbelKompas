// Sprint 4: sermon details (BK-019), templates (BK-020) and keyword search (BK-034, BK-035, BK-038).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const DOC = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function createNote(q: pg.Client, title = "Preek") {
  const { rows } = await q.query("select * from public.create_note($1, 'preek', null, $2, 'h0')", [title, JSON.stringify(DOC(""))]);
  return rows[0] as { id: string; document_version: number };
}

type Save = { id: string; base: number; text?: string; reason?: string | null; sermon?: unknown; title?: string; links?: unknown[] };
async function save(q: pg.Client, a: Save) {
  const text = a.text ?? "tekst";
  const { rows } = await q.query(
    `select * from public.save_note($1, $2, $3, 'preek', null, $4, $5, $6, $7, $8, null, $9)`,
    [
      a.id,
      a.base,
      a.title ?? "Preek",
      JSON.stringify(DOC(text)),
      `h-${text}`,
      JSON.stringify([{ block_id: randomUUID(), block_type: "paragraph", plain_text: text, position: 0, content_hash: "x" }]),
      JSON.stringify(a.links ?? []),
      a.reason ?? null,
      a.sermon === undefined ? null : JSON.stringify(a.sermon),
    ],
  );
  return rows[0] as { id: string; document_version: number; current_revision: number };
}

async function failCode(q: pg.Client, run: () => Promise<unknown>): Promise<string> {
  await q.query("savepoint expect_error");
  const code = await pgError(run());
  await q.query("rollback to savepoint expect_error");
  return code;
}

const PARTS = { parts: [{ kind: "kop", text: "Inleiding" }, { kind: "gebed", text: "" }] };

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

describe("sermon details", () => {
  it("are saved with the note, reuse names case-insensitively and land in the revision", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      const s1 = await save(q, { id: n.id, base: 1, sermon: { speaker: " Ds. De Vries ", organization: "Grote Kerk", series: "Genesis", service_type: "ochtenddienst" } });
      const n2 = await createNote(q, "Tweede");
      await save(q, { id: n2.id, base: 1, sermon: { speaker: "ds. de vries", organization: "", series: null } });
      const s3 = await save(q, { id: n.id, base: s1.document_version, reason: "handmatig" });
      const speakers = (await q.query("select name from public.speakers")).rows;
      const details = (await q.query("select service_type, organization_id from public.sermon_details where note_id = $1", [n2.id])).rows[0];
      const meta = (await q.query("select metadata_json from public.note_revisions where note_id = $1", [n.id])).rows[0].metadata_json;
      return { speakers, details, meta, s3 };
    });
    expect(r.speakers).toEqual([{ name: "Ds. De Vries" }]);
    expect(r.details).toEqual({ service_type: null, organization_id: null });
    expect(r.meta.sermon).toEqual({ speaker: "Ds. De Vries", organization: "Grote Kerk", series: "Genesis", service_type: "ochtenddienst" });
    expect(r.s3.current_revision).toBe(1);
  });

  it("a stale save with other sermon details is a conflict, an identical retry is not", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      await save(q, { id: n.id, base: 1, sermon: { speaker: "A" } });
      const retry = await save(q, { id: n.id, base: 1, sermon: { speaker: "A" } });
      expect(retry.document_version).toBe(2);
      expect(await failCode(q, () => save(q, { id: n.id, base: 1, sermon: { speaker: "B" } }))).toBe("40001");
    });
  });

  it("rejects invalid or too long values", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      expect(await failCode(q, () => save(q, { id: n.id, base: 1, sermon: { speaker: "x".repeat(121) } }))).toBe("22023");
      expect(await failCode(q, () => save(q, { id: n.id, base: 1, sermon: { speaker: 5 } }))).toBe("22023");
      expect(await failCode(q, () => save(q, { id: n.id, base: 1, sermon: [] }))).toBe("22023");
    });
  });

  it("are invisible to other users and cannot be written directly", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q);
      await save(q, { id: n.id, base: 1, sermon: { speaker: "Geheim" } });
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.speakers")).rows).toEqual([]);
      expect((await q.query("select * from public.sermon_details")).rows).toEqual([]);
      expect(await failCode(q, () => q.query("insert into public.speakers (owner_id, name) values ($1, 'X')", [bob]))).toBe(PG.insufficientPrivilege);
      expect(await failCode(q, () => q.query("insert into public.sermon_details (note_id, owner_id) values ($1, $2)", [n.id, bob]))).toBe(PG.insufficientPrivilege);
    });
  });

  it("can never point at another owner's speaker, even for the database owner", async () => {
    const theirs = await as(db, { kind: "user", id: bob }, async (q) => {
      const n = await createNote(q);
      await save(q, { id: n.id, base: 1, sermon: { speaker: "Bob's dominee" } });
      return null;
    });
    expect(theirs).toBeNull();
    // superuser session: the trigger still refuses a cross-owner link
    await db.query("begin");
    try {
      const sp = await db.query("insert into public.speakers (owner_id, name) values ($1, 'Van Bob') returning id", [bob]);
      const n = await db.query("insert into public.notes (owner_id, title) values ($1, 'A') returning id", [alice]);
      const code = await pgError(
        db.query("insert into public.sermon_details (note_id, owner_id, speaker_id) values ($1, $2, $3)", [n.rows[0].id, alice, sp.rows[0].id]),
      );
      expect(code).toBe(PG.insufficientPrivilege);
    } finally {
      await db.query("rollback");
    }
  });
});

describe("templates", () => {
  it("the owner creates, edits (version goes up) and archives a template", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const t = (await q.query("insert into public.note_templates (name, note_type, template_json) values ('Mijn preek', 'preek', $1) returning *", [JSON.stringify(PARTS)])).rows[0];
      const u = (await q.query("update public.note_templates set name = 'Preek 2' where id = $1 returning *", [t.id])).rows[0];
      const a = (await q.query("update public.note_templates set archived_at = now() where id = $1 returning *", [t.id])).rows[0];
      return { t, u, a };
    });
    expect(r.t).toMatchObject({ owner_id: alice, template_version: 1 });
    expect(r.u.template_version).toBe(2);
    expect(r.a.template_version).toBe(2);
    expect(r.a.archived_at).not.toBeNull();
  });

  it("refuses invalid structures", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const ins = (json: unknown) => q.query("insert into public.note_templates (name, template_json) values ('X', $1)", [JSON.stringify(json)]);
      expect(await failCode(q, () => ins({ parts: [] }))).toBe(PG.checkViolation);
      expect(await failCode(q, () => ins({ parts: [{ kind: "script", text: "" }] }))).toBe(PG.checkViolation);
      expect(await failCode(q, () => ins({ parts: [{ kind: "kop", text: "x".repeat(501) }] }))).toBe(PG.checkViolation);
      expect(await failCode(q, () => ins({ parts: Array(51).fill({ kind: "alinea" }) }))).toBe(PG.checkViolation);
    });
  });

  it("are private: others cannot read, change or create them in someone else's name", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const t = (await q.query("insert into public.note_templates (name, template_json) values ('Van Alice', $1) returning id", [JSON.stringify(PARTS)])).rows[0];
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.note_templates")).rows).toEqual([]);
      expect((await q.query("update public.note_templates set name = 'Gekaapt' where id = $1", [t.id])).rowCount).toBe(0);
      expect(
        await failCode(q, () => q.query("insert into public.note_templates (owner_id, name, template_json) values ($1, 'X', $2)", [alice, JSON.stringify(PARTS)])),
      ).toBe(PG.insufficientPrivilege);
      expect(await failCode(q, () => q.query("update public.note_templates set owner_id = $1", [bob]))).toBe(PG.insufficientPrivilege);
    });
  });
});

describe("keyword search", () => {
  it("finds the owner's notes by words in blocks and titles, with safe highlight markers", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => {
      const a = await createNote(q, "Over de goede herder");
      await save(q, { id: a.id, base: 1, title: "Over de goede herder", text: "De herders waren in het veld <script>" });
      const b = await createNote(q, "Iets anders");
      await save(q, { id: b.id, base: 1, title: "Iets anders", text: "Niets hierover" });
      const found = (await q.query("select * from public.search_notes('herder')")).rows;
      const prefix = (await q.query("select note_id from public.search_notes('herd')")).rows;
      const odd = (await q.query("select count(*)::int c from public.search_notes($1)", ["'):* | !& <>"])).rows[0].c;
      return { a: a.id, found, prefix, odd };
    });
    expect(r.found).toHaveLength(1);
    expect(r.found[0].note_id).toBe(r.a);
    expect(r.found[0].block_id).not.toBeNull();
    expect(r.found[0].snippet).toContain("\u0001herders\u0002");
    expect(r.found[0].snippet).not.toContain("<script>"); // plain text only; the app escapes it anyway
    expect(r.prefix.map((x: { note_id: string }) => x.note_id)).toEqual([r.a]);
    expect(r.odd).toBe(0);
  });

  it("filters by type, speaker, book and archive", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q, "Zoekfilter");
      await save(q, {
        id: n.id,
        base: 1,
        title: "Zoekfilter",
        text: "Licht in de duisternis",
        sermon: { speaker: "Ds. Licht" },
        links: [{ block_id: randomUUID(), reference_text: "Genesis 1:3", translation: "TEST", book: "GEN", start_chapter: 1, start_verse: 3, end_chapter: 1, end_verse: 3 }],
      });
      const count = async (sql: string, args: unknown[] = []) => (await q.query(sql, args)).rows.length;
      expect(await count("select * from public.search_notes('licht', p_type => 'preek')")).toBe(1);
      expect(await count("select * from public.search_notes('licht', p_type => 'gebed')")).toBe(0);
      expect(await count("select * from public.search_notes('licht', p_speaker => 'ds. licht')")).toBe(1);
      expect(await count("select * from public.search_notes('licht', p_speaker => 'iemand')")).toBe(0);
      expect(await count("select * from public.search_notes('licht', p_book => 'GEN')")).toBe(1);
      expect(await count("select * from public.search_notes('licht', p_book => 'EXO')")).toBe(0);
      await q.query("select public.set_note_archived($1, true)", [n.id]);
      expect(await count("select * from public.search_notes('licht')")).toBe(0);
      expect(await count("select * from public.search_notes('licht', p_archived => true)")).toBe(1);
    });
  });

  it("never returns another user's notes", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const n = await createNote(q, "Privé");
      await save(q, { id: n.id, base: 1, title: "Privé", text: "geheimwoord" });
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect((await q.query("select * from public.search_notes('geheimwoord')")).rows).toEqual([]);
    });
    expect(await pgError(as(db, { kind: "anon" }, (q) => q.query("select * from public.search_notes('x')")))).toBe(PG.insufficientPrivilege);
  });

  it("searches Bible text of readable translations only", async () => {
    const r = await as(db, { kind: "user", id: alice }, async (q) => ({
      test: (await q.query("select * from public.search_bible('TEST', 'fictieve')")).rows,
      hsv: (await q.query("select * from public.search_bible('HSV', 'fictieve')")).rows,
    }));
    expect(r.test.length).toBeGreaterThan(0);
    expect(r.test[0]).toMatchObject({ book_code: "GEN", chapter: 1, verse: 1 });
    expect(r.test[0].snippet).toContain("\u0001");
    expect(r.hsv).toEqual([]);
  });
});
