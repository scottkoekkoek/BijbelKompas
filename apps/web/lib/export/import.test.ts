import { describe, expect, it } from "vitest";
import { EXPORT_FORMAT } from "./format";
import { readExport, revisionBatches, type ImportRevision } from "./import";

const note = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Preek",
  noteType: "preek",
  status: "afgerond",
  eventDate: "2026-11-15",
  createdAt: "2026-11-15T09:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  completedAt: "2026-11-15T12:00:00.000Z",
  archivedAt: null,
  documentVersion: 4,
  sermon: { speaker: "Ds. Fictief", organization: null, series: null, serviceType: null },
  document: { type: "doc", content: [] },
  passageLinks: [],
  revisions: [
    { number: 2, reason: "afronden", createdAt: "2026-11-15T12:00:00.000Z", metadata: {}, contentHash: "b", document: {} },
    { number: 1, reason: "handmatig", createdAt: "2026-11-15T10:00:00.000Z", metadata: {}, contentHash: "a", document: {} },
  ],
};
const file = (over: Record<string, unknown> = {}) => ({ format: EXPORT_FORMAT, version: 1, exportedAt: "2026-11-16T10:00:00.000Z", notes: [note], templates: [], preferences: null, readingPosition: null, ...over });

describe("reading an export back (AT-15)", () => {
  it("reads notes with their revisions in order; an export without Sprint 7 lists still works", () => {
    const r = readExport(file());
    if (!r.ok) throw new Error(r.message);
    expect(r.data.notes[0]!.revisions.map((x) => x.number)).toEqual([1, 2]);
    expect(r.data.extras.collections).toEqual([]);
    expect(r.data.extras.highlights).toEqual([]); // exports from before Sprint 9 have none
  });

  it("reads reading progress (Ronde 4); older exports have none, a damaged verse is refused", () => {
    const r = readExport(file({ readVerses: ["JHN.3.16", "1JN.4.8"] }));
    if (!r.ok) throw new Error(r.message);
    expect(r.data.extras.readVerses).toEqual(["JHN.3.16", "1JN.4.8"]);
    const old = readExport(file());
    expect(old.ok && old.data.extras.readVerses).toEqual([]);
    expect(readExport(file({ readVerses: ["Johannes 3:16"] })).ok).toBe(false);
  });

  it("refuses other files, newer versions and damaged notes with a clear message", () => {
    expect(readExport({ hello: 1 })).toEqual({ ok: false, message: "Dit is geen BijbelKompas-export." });
    expect(readExport(file({ version: 2 }))).toMatchObject({ ok: false, message: expect.stringContaining("versie 2") });
    expect(readExport(file({ notes: [{ ...note, noteType: "roman" }] }))).toEqual({ ok: false, message: "Notitie 1 in de export is beschadigd." });
  });

  it("splits large histories into requests of limited size", () => {
    const big = (n: number): ImportRevision => ({ number: n, reason: "pauze", createdAt: "2026-11-15T10:00:00.000Z", metadata: {}, contentHash: "x", document: { t: "x".repeat(400) } });
    const batches = revisionBatches([1, 2, 3, 4, 5].map(big), 1200);
    expect(batches.map((b) => b.map((r) => r.number))).toEqual([[1, 2], [3, 4], [5]]);
    expect(revisionBatches([])).toEqual([]);
  });
});
