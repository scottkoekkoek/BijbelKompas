import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type {
  CreateNoteInput,
  Note,
  NoteDocument,
  NoteStatus,
  NoteSummary,
  NoteType,
  RevisionReason,
  RevisionSummary,
} from "@bk/schemas";
import type { createClient } from "@/lib/supabase/server";
import { canonicalJson, deriveIndexes, emptyDocument, referenceBlock, validateDocument, type PMNode } from "./document";
import { refLabel } from "./reference";

type Db = Awaited<ReturnType<typeof createClient>>;

type NoteRow = {
  id: string;
  title: string;
  note_type: NoteType;
  status: NoteStatus;
  event_date: string | null;
  document_version: number;
  current_revision: number;
  archived_at: string | null;
  updated_at: string;
};

export const NOTE_COLUMNS =
  "id, title, note_type, status, event_date, document_version, current_revision, archived_at, updated_at";

export function toSummary(r: NoteRow): NoteSummary {
  return {
    id: r.id,
    title: r.title,
    noteType: r.note_type,
    status: r.status,
    eventDate: r.event_date,
    documentVersion: r.document_version,
    currentRevision: r.current_revision,
    archived: r.archived_at !== null,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const documentHash = (doc: NoteDocument) => sha256(canonicalJson(doc));

export type Filters = { q?: string; type?: NoteType; status?: NoteStatus; archived?: boolean };

export async function listNotes(db: Db, f: Filters = {}): Promise<NoteSummary[]> {
  let query = db.from("notes").select(NOTE_COLUMNS).order("updated_at", { ascending: false }).limit(200);
  query = f.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (f.type) query = query.eq("note_type", f.type);
  if (f.status) query = query.eq("status", f.status);
  if (f.q) query = query.ilike("title", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data as NoteRow[]).map(toSummary);
}

export async function getNote(db: Db, id: string): Promise<Note | null> {
  const [note, doc] = await Promise.all([
    db.from("notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle(),
    db.from("note_documents").select("document_json").eq("note_id", id).maybeSingle(),
  ]);
  if (note.error) throw note.error;
  if (!note.data || !doc.data) return null;
  return { ...toSummary(note.data as NoteRow), document: doc.data.document_json as NoteDocument };
}

export type SaveResult =
  | { ok: true; note: NoteSummary }
  | { ok: false; kind: "conflict"; current: NoteSummary | null }
  | { ok: false; kind: "invalid"; message: string; details?: unknown }
  | { ok: false; kind: "not_found" };

type SaveArgs = {
  baseVersion: number;
  title: string;
  noteType: NoteType;
  eventDate: string | null;
  document: NoteDocument;
  reason?: RevisionReason;
  status?: NoteStatus;
};

export async function saveNote(db: Db, id: string, a: SaveArgs): Promise<SaveResult> {
  const problems = validateDocument(a.document);
  if (problems.length > 0) return { ok: false, kind: "invalid", message: "Het document is ongeldig.", details: problems };
  const { blocks, links } = deriveIndexes(a.document, sha256);

  const { data, error } = await db
    .rpc("save_note", {
      p_note_id: id,
      p_base_version: a.baseVersion,
      p_title: a.title,
      p_note_type: a.noteType,
      p_event_date: a.eventDate,
      p_document: a.document,
      p_content_hash: documentHash(a.document),
      p_blocks: blocks,
      p_links: links,
      p_reason: a.reason ?? null,
      p_status: a.status ?? null,
    })
    .single();
  if (error) {
    if (error.code === "40001") {
      const current = await db.from("notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle();
      return { ok: false, kind: "conflict", current: current.data ? toSummary(current.data as NoteRow) : null };
    }
    if (error.code === "42501") return { ok: false, kind: "not_found" };
    if (error.code === "22023" || error.code === "23514") {
      return { ok: false, kind: "invalid", message: "Een Bijbelverwijzing of waarde klopt niet.", details: error.message };
    }
    throw error;
  }
  return { ok: true, note: toSummary(data as NoteRow) };
}

/** New note, optionally starting with a Bible reference (from the reader) or a given document. */
export async function createNote(
  db: Db,
  input: CreateNoteInput,
  bookName: (code: string) => string | null,
): Promise<{ ok: true; note: NoteSummary } | { ok: false; message: string; details?: unknown }> {
  let document: NoteDocument = emptyDocument(randomUUID());
  if (input.document) {
    document = input.document;
  } else if (input.reference) {
    const r = input.reference;
    const name = bookName(r.book);
    if (!name) return { ok: false, message: "Onbekend Bijbelboek." };
    const label = refLabel(name, r.startChapter, r.startVerse, r.endChapter, r.endVerse);
    document = {
      type: "doc",
      content: [
        referenceBlock({ ...r, blockId: randomUUID(), label }) as unknown as Record<string, unknown>,
        { type: "paragraph", attrs: { blockId: randomUUID() } },
      ],
    };
  }
  const problems = validateDocument(document);
  if (problems.length > 0) return { ok: false, message: "Het document is ongeldig.", details: problems };

  const created = await db
    .rpc("create_note", {
      p_title: input.title ?? "",
      p_note_type: input.noteType ?? (input.reference ? "bijbelstudie" : "vrij"),
      p_event_date: input.eventDate ?? null,
      p_document: { type: "doc", content: [{ type: "paragraph", attrs: { blockId: randomUUID() } }] },
      p_content_hash: "nieuw",
    })
    .single();
  if (created.error) throw created.error;
  const row = created.data as NoteRow;

  // Store the real document through save_note, so blocks and links are derived the normal way.
  const saved = await saveNote(db, row.id, {
    baseVersion: row.document_version,
    title: row.title,
    noteType: row.note_type,
    eventDate: row.event_date,
    document,
  });
  if (!saved.ok) return { ok: false, message: "De notitie kon niet worden aangemaakt.", details: saved };
  return { ok: true, note: saved.note };
}

export async function listRevisions(db: Db, id: string): Promise<RevisionSummary[]> {
  const { data, error } = await db
    .from("note_revisions")
    .select("revision_number, reason, metadata_json, created_at")
    .eq("note_id", id)
    .order("revision_number", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    revisionNumber: r.revision_number,
    reason: r.reason,
    title: (r.metadata_json as { title?: string }).title ?? "",
    status: ((r.metadata_json as { status?: NoteStatus }).status ?? "concept") as NoteStatus,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function getRevision(db: Db, id: string, n: number) {
  const { data, error } = await db
    .from("note_revisions")
    .select("revision_number, reason, document_json, metadata_json, created_at")
    .eq("note_id", id)
    .eq("revision_number", n)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const meta = data.metadata_json as { title: string; note_type: NoteType; status: NoteStatus; event_date: string | null };
  return {
    revisionNumber: data.revision_number as number,
    reason: data.reason as RevisionReason,
    createdAt: new Date(data.created_at).toISOString(),
    meta,
    document: data.document_json as NoteDocument,
  };
}

/** Restoring writes the old content as a NEW revision ('herstel'); history is never rewritten. */
export async function restoreRevision(db: Db, id: string, n: number, baseVersion: number): Promise<SaveResult> {
  const rev = await getRevision(db, id, n);
  if (!rev) return { ok: false, kind: "not_found" };
  return saveNote(db, id, {
    baseVersion,
    title: rev.meta.title,
    noteType: rev.meta.note_type,
    eventDate: rev.meta.event_date,
    document: rev.document,
    reason: "herstel",
    status: "concept",
  });
}

export type { PMNode };
