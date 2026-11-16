// Sprint 5: offline sync operations (BK-025, BK-027, BK-028; AT-01, AT-07, AT-08).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, client, createUser, deleteUser, pgError, PG } from "./helpers";

let db: pg.Client;
let alice: string;
let bob: string;

const DOC = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

type Op = { device: string; op?: string; type: "create" | "save"; note: string; base?: number; text?: string; title?: string };
async function apply(q: pg.Client, o: Op) {
  const text = o.text ?? "tekst";
  const { rows } = await q.query(
    `select public.sync_apply($1, $2, $3, $4, $5, $6, 'preek', null, $7, $8, $9, '[]', null, null, null) as r`,
    [
      o.device,
      o.op ?? randomUUID(),
      o.type,
      o.note,
      o.base ?? null,
      o.title ?? "Offline preek",
      JSON.stringify(DOC(text)),
      `h-${text}`,
      JSON.stringify([{ block_id: randomUUID(), block_type: "paragraph", plain_text: text, position: 0, content_hash: "x" }]),
    ],
  );
  return rows[0].r as { status: string; original?: string; message?: string; note: { id: string; document_version: number } | null };
}

async function failCode(q: pg.Client, run: () => Promise<unknown>): Promise<string> {
  await q.query("savepoint expect_error");
  const code = await pgError(run());
  await q.query("rollback to savepoint expect_error");
  return code;
}

async function device(q: pg.Client) {
  const id = randomUUID();
  await q.query("select public.register_device($1, 'Testtelefoon')", [id]);
  return id;
}

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

describe("devices", () => {
  it("registering is idempotent; another owner's device id is refused", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const d = await device(q);
      await q.query("select public.register_device($1, 'Opnieuw')", [d]);
      expect((await q.query("select device_label from public.devices")).rows).toEqual([{ device_label: "Testtelefoon" }]);
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await failCode(q, () => q.query("select public.register_device($1, 'Kaping')", [d]))).toBe(PG.insufficientPrivilege);
      expect((await q.query("select * from public.devices")).rows).toEqual([]);
    });
  });
});

describe("sync_apply", () => {
  it("creates a note made offline once, with the device's id (AT-01)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const d = await device(q);
      const note = randomUUID();
      const op = randomUUID();
      const first = await apply(q, { device: d, op, type: "create", note, text: "Gemaakt zonder internet" });
      const again = await apply(q, { device: d, op, type: "create", note, text: "Gemaakt zonder internet" });
      expect(first).toMatchObject({ status: "accepted", note: { id: note, document_version: 2 } });
      expect(again).toMatchObject({ status: "duplicate", original: "accepted", note: { id: note, document_version: 2 } });
      const count = (await q.query("select count(*)::int c from public.notes where id = $1", [note])).rows[0].c;
      const blocks = (await q.query("select plain_text from public.note_blocks where note_id = $1", [note])).rows;
      expect(count).toBe(1);
      expect(blocks).toEqual([{ plain_text: "Gemaakt zonder internet" }]);
    });
  });

  it("the same save sent twice changes the server once (AT-07)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const d = await device(q);
      const note = randomUUID();
      await apply(q, { device: d, type: "create", note });
      const op = randomUUID();
      const a = await apply(q, { device: d, op, type: "save", note, base: 2, text: "Eerste" });
      const b = await apply(q, { device: d, op, type: "save", note, base: 2, text: "Eerste" });
      expect(a.status).toBe("accepted");
      expect(b).toMatchObject({ status: "duplicate", original: "accepted" });
      expect(b.note?.document_version).toBe(3);
      expect((await q.query("select count(*)::int c from public.sync_operations")).rows[0].c).toBe(2);
    });
  });

  it("a stale save is a recorded conflict and never overwrites", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const phone = await device(q);
      const laptop = await device(q);
      const note = randomUUID();
      await apply(q, { device: phone, type: "create", note, text: "Begin" });
      await apply(q, { device: laptop, type: "save", note, base: 2, text: "Van de laptop" });
      const op = randomUUID();
      const r = await apply(q, { device: phone, op, type: "save", note, base: 2, text: "Van de telefoon" });
      const retry = await apply(q, { device: phone, op, type: "save", note, base: 2, text: "Van de telefoon" });
      expect(r).toMatchObject({ status: "conflict", note: { document_version: 3 } });
      expect(retry).toMatchObject({ status: "duplicate", original: "conflict" });
      const text = (await q.query("select plain_text from public.note_blocks where note_id = $1", [note])).rows;
      expect(text).toEqual([{ plain_text: "Van de laptop" }]);
    });
  });

  it("invalid content is rejected and recorded, not applied", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const d = await device(q);
      const note = randomUUID();
      const r = await apply(q, { device: d, type: "create", note, title: "x".repeat(201) });
      expect(r.status).toBe("rejected");
      expect((await q.query("select count(*)::int c from public.notes where id = $1", [note])).rows[0].c).toBe(0);
    });
  });

  it("refuses another user's device and another user's note (AT-08)", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      const aliceDevice = await device(q);
      const aliceNote = randomUUID();
      await apply(q, { device: aliceDevice, type: "create", note: aliceNote });
      await q.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: bob, role: "authenticated" })]);
      expect(await failCode(q, () => apply(q, { device: aliceDevice, type: "save", note: aliceNote, base: 2 }))).toBe(PG.insufficientPrivilege);
      const bobDevice = await device(q);
      expect(await failCode(q, () => apply(q, { device: bobDevice, type: "save", note: aliceNote, base: 2, text: "Gekaapt" }))).toBe(PG.insufficientPrivilege);
      const taken = await apply(q, { device: bobDevice, type: "create", note: aliceNote });
      expect(taken).toMatchObject({ status: "conflict", note: null });
      expect((await q.query("select * from public.sync_operations where operation_type = 'save'")).rows).toEqual([]);
      expect((await q.query("select * from public.devices where id = $1", [aliceDevice])).rows).toEqual([]);
    });
  });

  it("the operation ledger cannot be written directly", async () => {
    await as(db, { kind: "user", id: alice }, async (q) => {
      expect(await failCode(q, () => q.query("update public.sync_operations set status = 'accepted'"))).toBe(PG.insufficientPrivilege);
    });
    expect(await pgError(as(db, { kind: "anon" }, (q) => q.query("select public.register_device($1)", [randomUUID()])))).toBe(PG.insufficientPrivilege);
  });
});
