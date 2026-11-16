import { describe, expect, it } from "vitest";
import { applyResult, backoffMs, latestContent, nextOperation, queueChange } from "./outbox";
import type { LocalContent } from "./types";

const doc = (t: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const content = (t: string): LocalContent => ({
  title: "Preek",
  noteType: "preek",
  eventDate: null,
  sermon: { speaker: null, organization: null, series: null, serviceType: null },
  document: doc(t),
});
let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const NOTE = "11111111-1111-4111-8111-111111111111";

describe("outbox", () => {
  it("keeps only the newest unsent content and the strongest reason", () => {
    let e = queueChange(undefined, NOTE, { content: content("a"), reason: "afronden", status: "afgerond" }, { now: 1 });
    e = queueChange(e, NOTE, { content: content("b"), reason: "pauze" }, { now: 2 });
    expect(e.pending).toMatchObject({ content: { document: doc("b") }, reason: "afronden", status: "afgerond" });
    expect(e.queuedAt).toBe(1);
  });

  it("resends an unanswered operation with the same id, and queues newer edits behind it", () => {
    let e = queueChange(undefined, NOTE, { content: content("a") }, { now: 1 });
    const first = nextOperation(e, 4, id)!;
    expect(first.op).toMatchObject({ type: "save", baseVersion: 4 });
    e = queueChange(first.entry, NOTE, { content: content("b") }, { now: 2 });
    const again = nextOperation(e, 4, id)!;
    expect(again.op.operationId).toBe(first.op.operationId); // timeout → same id → server deduplicates
    const done = applyResult(again.entry, { operationId: first.op.operationId, status: "accepted" });
    expect(done.outcome).toBe("synced");
    const next = nextOperation(done.entry!, 5, id)!;
    expect(next.op).toMatchObject({ baseVersion: 5, document: doc("b") });
    expect(next.op.operationId).not.toBe(first.op.operationId);
  });

  it("a note made offline is created first and saved after the create is answered", () => {
    let e = queueChange(undefined, NOTE, { content: content("nieuw") }, { createdLocally: true, now: 1 });
    const create = nextOperation(e, null, id)!;
    expect(create.op).toMatchObject({ type: "create", baseVersion: null, noteId: NOTE });
    e = queueChange(create.entry, NOTE, { content: content("meer") }, { now: 2 });
    const r = applyResult(e, { operationId: create.op.operationId, status: "duplicate", original: "accepted" });
    expect(r.entry).toMatchObject({ createdLocally: false, sent: null });
    expect(nextOperation(r.entry!, 2, id)!.op).toMatchObject({ type: "save", baseVersion: 2 });
  });

  it("sends the version the text was built on, even when a newer server copy arrived meanwhile", () => {
    // the editor loaded version 3; a pull later stored version 4 from another device
    const e = queueChange(undefined, NOTE, { content: content("a"), baseVersion: 3 }, { now: 1 });
    const op = nextOperation(e, 4, id)!;
    expect(op.op.baseVersion).toBe(3); // → the server answers "conflict", never a silent overwrite
    const summary = { id: NOTE, title: "Preek", noteType: "preek" as const, status: "concept" as const, eventDate: null,
      documentVersion: 7, currentRevision: 0, archived: false, updatedAt: "2026-11-16T10:00:00Z" };
    const after = applyResult(queueChange(op.entry, NOTE, { content: content("b"), baseVersion: 3 }, { now: 2 }),
      { operationId: op.op.operationId, status: "accepted", note: summary });
    expect(nextOperation(after.entry!, 4, id)!.op.baseVersion).toBe(7);
  });

  it("a save without a known server version waits", () => {
    const e = queueChange(undefined, NOTE, { content: content("a") }, { now: 1 });
    expect(nextOperation(e, null, id)).toBeNull();
  });

  it("a conflict blocks the entry and keeps the newest text for a copy", () => {
    let e = queueChange(undefined, NOTE, { content: content("mijn tekst") }, { now: 1 });
    const s = nextOperation(e, 3, id)!;
    e = queueChange(s.entry, NOTE, { content: content("nog nieuwer") }, { now: 2 });
    const r = applyResult(e, { operationId: s.op.operationId, status: "conflict" });
    expect(r.outcome).toBe("conflict");
    expect(nextOperation(r.entry!, 3, id)).toBeNull();
    expect(latestContent(r.entry!)?.document).toEqual(doc("nog nieuwer"));
  });

  it("rejected and retryable answers", () => {
    const e = nextOperation(queueChange(undefined, NOTE, { content: content("a") }, { now: 1 }), 1, id)!;
    expect(applyResult(e.entry, { operationId: e.op.operationId, status: "retryable" }).outcome).toBe("retry");
    expect(applyResult(e.entry, { operationId: "other", status: "accepted" }).outcome).toBe("ignored");
    expect(applyResult(e.entry, { operationId: e.op.operationId, status: "rejected" }).entry?.blocked).toBe("rejected");
  });

  it("backs off exponentially with a cap", () => {
    expect(backoffMs(1, () => 0.5)).toBe(5_000);
    expect(backoffMs(3, () => 0.5)).toBe(20_000);
    expect(backoffMs(20, () => 0.5)).toBe(300_000);
  });
});
