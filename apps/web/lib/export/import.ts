/**
 * AT-15: reading an export back. Pure (no data access), shared by the browser (which reads the zip
 * and sends it piece by piece, so no request gets too large) and the server (which checks every piece).
 */
import { NoteStatus, NoteType, RevisionReason, SermonDetails } from "@bk/schemas";
import { z } from "zod";
import { EXPORT_FORMAT, EXPORT_VERSION } from "./format";

const When = z.iso.datetime({ offset: true });
const Doc = z.object({ type: z.literal("doc"), content: z.array(z.unknown()).max(5000) }).loose();

export const ImportNote = z.object({
  id: z.uuid(),
  title: z.string().max(200),
  noteType: NoteType,
  status: NoteStatus,
  eventDate: z.iso.date().nullable(),
  createdAt: When.nullable(),
  completedAt: When.nullable(),
  archivedAt: When.nullable(),
  sermon: SermonDetails.nullable(),
  document: Doc,
});
export type ImportNote = z.infer<typeof ImportNote>;

export const ImportRevision = z.object({
  number: z.number().int().min(1).max(100000),
  reason: RevisionReason,
  createdAt: When,
  metadata: z.record(z.string(), z.unknown()),
  contentHash: z.string().max(128),
  document: z.record(z.string(), z.unknown()),
});
export type ImportRevision = z.infer<typeof ImportRevision>;

const Rows = z.array(z.record(z.string(), z.unknown())).max(20000).default([]);
export const ImportExtras = z.object({
  collections: Rows,
  collectionItems: Rows,
  questions: Rows,
  questionNotes: Rows,
  questionPassages: Rows,
  templates: Rows,
  highlights: Rows,
  /** Ronde 4: read verses as "JHN.3.16" (older exports have none) */
  readVerses: z.array(z.string().regex(/^[1-3]?[A-Z]{2,3}\.\d{1,3}\.\d{1,3}$/)).max(40000).default([]),
});
export type ImportExtras = z.infer<typeof ImportExtras>;

/** One request to POST /api/v1/import. */
export const ImportStep = z.discriminatedUnion("step", [
  z.object({ step: z.literal("note"), note: ImportNote }),
  z.object({ step: z.literal("revisions"), noteId: z.uuid(), revisions: z.array(ImportRevision).min(1).max(500) }),
  z.object({ step: z.literal("extras"), noteMap: z.record(z.uuid(), z.uuid()), extras: ImportExtras }),
]);
export type ImportStep = z.infer<typeof ImportStep>;

export type ParsedExport = {
  exportedAt: string | null;
  notes: { note: ImportNote; revisions: ImportRevision[] }[];
  extras: ImportExtras;
};

/** Checks that a file is a BijbelKompas export this version understands, and reads it. */
export function readExport(raw: unknown): { ok: true; data: ParsedExport } | { ok: false; message: string } {
  const top = z
    .object({ format: z.string(), version: z.number(), exportedAt: z.string().optional(), notes: z.array(z.unknown()) })
    .loose()
    .safeParse(raw);
  if (!top.success || top.data.format !== EXPORT_FORMAT) return { ok: false, message: "Dit is geen BijbelKompas-export." };
  if (top.data.version !== EXPORT_VERSION) {
    return { ok: false, message: `Deze export heeft versie ${top.data.version}; deze app kan versie ${EXPORT_VERSION} inlezen.` };
  }
  const notes: ParsedExport["notes"] = [];
  for (const [i, n] of top.data.notes.entries()) {
    const note = ImportNote.safeParse(n);
    const revisions = z.array(ImportRevision).safeParse((n as { revisions?: unknown })?.revisions ?? []);
    if (!note.success || !revisions.success) return { ok: false, message: `Notitie ${i + 1} in de export is beschadigd.` };
    notes.push({ note: note.data, revisions: [...revisions.data].sort((a, b) => a.number - b.number) });
  }
  const extras = ImportExtras.safeParse(raw);
  if (!extras.success) return { ok: false, message: "De collecties, vragen, markeringen of sjablonen in de export zijn beschadigd." };
  return { ok: true, data: { exportedAt: top.data.exportedAt ?? null, notes, extras: extras.data } };
}

/** Splits revisions into requests of at most `maxBytes` of JSON (a server request may not be too large). */
export function revisionBatches(revisions: ImportRevision[], maxBytes = 2_000_000): ImportRevision[][] {
  const batches: ImportRevision[][] = [];
  let current: ImportRevision[] = [];
  let size = 0;
  for (const r of revisions) {
    const s = JSON.stringify(r).length;
    if (current.length > 0 && (size + s > maxBytes || current.length >= 500)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(r);
    size += s;
  }
  if (current.length) batches.push(current);
  return batches;
}
