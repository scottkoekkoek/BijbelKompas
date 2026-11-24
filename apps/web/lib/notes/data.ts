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
  SermonDetails,
  TemplateInput,
  TemplateUpdate,
  NoteTemplate,
} from "@bk/schemas";
import { EMPTY_SERMON } from "@bk/schemas";
import type { createClient } from "@/lib/supabase/server";
import { canonicalJson, deriveIndexes, emptyDocument, referenceBlock, validateDocument, type PMNode } from "./document";
import { refLabel, type BookInfo } from "./reference";
import { buildDocument, findBuiltin } from "./templates";

type Db = Awaited<ReturnType<typeof createClient>>;

export type NoteRow = {
  id: string;
  title: string;
  note_type: NoteType;
  status: NoteStatus;
  event_date: string | null;
  document_version: number;
  current_revision: number;
  archived_at: string | null;
  deleted_at?: string | null;
  updated_at: string;
};

export const NOTE_COLUMNS =
  "id, title, note_type, status, event_date, document_version, current_revision, archived_at, deleted_at, updated_at";

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
    trashed: r.deleted_at != null,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const documentHash = (doc: NoteDocument) => sha256(canonicalJson(doc));

export type Filters = { q?: string; type?: NoteType; status?: NoteStatus; archived?: boolean; trash?: boolean };

function notesQuery(db: Db, f: Filters, count = false) {
  let query = count
    ? db.from("notes").select("id", { count: "exact", head: true })
    : db.from("notes").select(NOTE_COLUMNS).order("updated_at", { ascending: false }).order("id");
  // Ronde 3 §3: the trash is its own list; every other list leaves it out
  if (f.trash) query = query.not("deleted_at", "is", null);
  else {
    query = query.is("deleted_at", null);
    query = f.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  }
  if (f.type) query = query.eq("note_type", f.type);
  if (f.status) query = query.eq("status", f.status);
  if (f.q) query = query.ilike("title", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  return query;
}

/** The most recently changed notes (at most `limit`): for pickers and small overviews. */
export async function listNotes(db: Db, f: Filters = {}, limit = 200): Promise<NoteSummary[]> {
  const { data, error } = await notesQuery(db, f).limit(limit);
  if (error) throw error;
  return (data as NoteRow[]).map(toSummary);
}

export const NOTES_PAGE_SIZE = 50;

/** Ronde 4 (V3): one page of the notes list plus the total, so no note is ever out of reach. */
export async function listNotesPage(db: Db, f: Filters, page: number): Promise<{ notes: NoteSummary[]; total: number; page: number; pages: number }> {
  const total = await countNotes(db, f);
  const pages = Math.max(1, Math.ceil(total / NOTES_PAGE_SIZE));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const from = (p - 1) * NOTES_PAGE_SIZE;
  const { data, error } = await notesQuery(db, f).range(from, from + NOTES_PAGE_SIZE - 1);
  if (error) throw error;
  return { notes: (data as NoteRow[]).map(toSummary), total, page: p, pages };
}

/** Ronde 4 (V4): an exact count in the database, not a count of a capped list. */
export async function countNotes(db: Db, f: Filters = {}): Promise<number> {
  const { count, error } = await notesQuery(db, f, true);
  if (error) throw error;
  return count ?? 0;
}

type SermonRow = {
  service_type: string | null;
  speaker: { name: string } | null;
  organization: { name: string } | null;
  series: { name: string } | null;
};
const SERMON_COLUMNS = "service_type, speaker:speakers(name), organization:organizations(name), series:sermon_series(name)";

export async function getNote(db: Db, id: string): Promise<Note | null> {
  const [note, doc, sermon] = await Promise.all([
    db.from("notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle(),
    db.from("note_documents").select("document_json").eq("note_id", id).maybeSingle(),
    db.from("sermon_details").select(SERMON_COLUMNS).eq("note_id", id).maybeSingle(),
  ]);
  if (note.error) throw note.error;
  if (sermon.error) throw sermon.error;
  if (!note.data || !doc.data) return null;
  const sd = sermon.data as unknown as SermonRow | null;
  return {
    ...toSummary(note.data as NoteRow),
    document: doc.data.document_json as NoteDocument,
    sermon: sd
      ? { speaker: sd.speaker?.name ?? null, organization: sd.organization?.name ?? null, series: sd.series?.name ?? null, serviceType: sd.service_type }
      : EMPTY_SERMON,
  };
}

/** Ronde 4 (A1): the sermon details of the most recent sermon note, to start the next one with. */
export async function getLastSermon(db: Db): Promise<SermonDetails | null> {
  const { data: last, error } = await db
    .from("notes")
    .select("id")
    .eq("note_type", "preek")
    .is("deleted_at", null)
    .order("event_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!last) return null;
  const { data } = await db.from("sermon_details").select(SERMON_COLUMNS).eq("note_id", last.id).maybeSingle();
  const sd = data as unknown as SermonRow | null;
  return sd ? { speaker: sd.speaker?.name ?? null, organization: sd.organization?.name ?? null, series: sd.series?.name ?? null, serviceType: sd.service_type } : null;
}

/** Names used before, offered as suggestions in the sermon fields. */
export async function getSermonSuggestions(db: Db) {
  const names = async (table: "speakers" | "organizations" | "sermon_series") => {
    const { data, error } = await db.from(table).select("name").order("name").limit(500);
    if (error) throw error;
    return (data ?? []).map((r) => r.name as string);
  };
  const [speakers, organizations, series] = await Promise.all([names("speakers"), names("organizations"), names("sermon_series")]);
  return { speakers, organizations, series };
}
export type SermonSuggestions = Awaited<ReturnType<typeof getSermonSuggestions>>;

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
  sermon?: SermonDetails;
};

const sermonParam = (s: SermonDetails | undefined) =>
  s ? { speaker: s.speaker, organization: s.organization, series: s.series, service_type: s.serviceType } : null;

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
      p_sermon: sermonParam(a.sermon),
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
  ctx: { books: BookInfo[]; translation: string },
): Promise<{ ok: true; note: NoteSummary } | { ok: false; message: string; details?: unknown }> {
  let document: NoteDocument = emptyDocument(randomUUID());
  let noteType = input.noteType;
  if (input.document) {
    document = input.document;
  } else if (input.template) {
    const template = await getTemplate(db, input.template);
    if (!template) return { ok: false, message: "Sjabloon niet gevonden." };
    document = buildDocument(template.parts, { newId: randomUUID, books: ctx.books, translation: ctx.translation });
    noteType = noteType ?? template.noteType;
  } else if (input.reference) {
    const r = input.reference;
    const name = ctx.books.find((b) => b.code === r.book)?.name;
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
      p_note_type: noteType ?? (input.reference ? "bijbelstudie" : "vrij"),
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
  const meta = data.metadata_json as {
    title: string;
    note_type: NoteType;
    status: NoteStatus;
    event_date: string | null;
    sermon?: { speaker: string | null; organization: string | null; series: string | null; service_type: string | null };
  };
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
    // revisions from before Sprint 4 have no sermon details: then the current ones stay
    sermon: rev.meta.sermon
      ? {
          speaker: rev.meta.sermon.speaker,
          organization: rev.meta.sermon.organization,
          series: rev.meta.sermon.series,
          serviceType: rev.meta.sermon.service_type,
        }
      : undefined,
  });
}

// templates (BK-020) ---------------------------------------------------------------
type TemplateRow = {
  id: string;
  name: string;
  note_type: NoteType;
  description: string;
  template_json: { parts: NoteTemplate["parts"] };
  template_version: number;
  archived_at: string | null;
};
const TEMPLATE_COLUMNS = "id, name, note_type, description, template_json, template_version, archived_at";
const toTemplate = (r: TemplateRow): NoteTemplate => ({
  id: r.id,
  builtIn: false,
  name: r.name,
  noteType: r.note_type,
  description: r.description,
  parts: r.template_json.parts,
  version: r.template_version,
  archived: r.archived_at !== null,
});

export async function listTemplates(db: Db, archived = false): Promise<NoteTemplate[]> {
  let q = db.from("note_templates").select(TEMPLATE_COLUMNS).order("name");
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as TemplateRow[]).map(toTemplate);
}

/** An own template (by uuid, RLS limits it to the owner) or a built-in one ("ingebouwd:…"). */
export async function getTemplate(db: Db, id: string): Promise<NoteTemplate | null> {
  if (id.startsWith("ingebouwd:")) return findBuiltin(id);
  const { data, error } = await db.from("note_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toTemplate(data as TemplateRow) : null;
}

export async function createTemplate(db: Db, t: TemplateInput): Promise<NoteTemplate> {
  const { data, error } = await db
    .from("note_templates")
    .insert({ name: t.name, note_type: t.noteType, description: t.description, template_json: { parts: t.parts } })
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) throw error;
  return toTemplate(data as TemplateRow);
}

export async function updateTemplate(db: Db, id: string, t: TemplateUpdate): Promise<NoteTemplate | null> {
  const patch: Record<string, unknown> = {};
  if (t.name !== undefined) patch.name = t.name;
  if (t.noteType !== undefined) patch.note_type = t.noteType;
  if (t.description !== undefined) patch.description = t.description;
  if (t.parts !== undefined) patch.template_json = { parts: t.parts };
  if (t.archived !== undefined) patch.archived_at = t.archived ? new Date().toISOString() : null;
  const { data, error } = await db.from("note_templates").update(patch).eq("id", id).select(TEMPLATE_COLUMNS).maybeSingle();
  if (error) throw error;
  return data ? toTemplate(data as TemplateRow) : null;
}

// keyword search (BK-034, BK-035, BK-038) ------------------------------------------------
export type SearchFilters = {
  type?: NoteType;
  status?: NoteStatus;
  from?: string;
  to?: string;
  book?: string;
  speaker?: string;
  archived?: boolean;
};
export type NoteHit = {
  noteId: string;
  title: string;
  noteType: NoteType;
  status: NoteStatus;
  eventDate: string | null;
  updatedAt: string;
  blockId: string | null;
  snippet: string;
};
export type VerseHit = { bookCode: string; bookName: string; chapter: number; verse: number; snippet: string };

export async function searchNotes(db: Db, query: string, f: SearchFilters = {}, limit = 50): Promise<NoteHit[]> {
  const { data, error } = await db.rpc("search_notes", {
    p_query: query,
    p_type: f.type ?? null,
    p_status: f.status ?? null,
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_book: f.book ?? null,
    p_speaker: f.speaker ?? null,
    p_archived: f.archived ?? false,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    noteId: r.note_id as string,
    title: r.title as string,
    noteType: r.note_type as NoteType,
    status: r.status as NoteStatus,
    eventDate: r.event_date as string | null,
    updatedAt: new Date(r.updated_at as string).toISOString(),
    blockId: r.block_id as string | null,
    snippet: r.snippet as string,
  }));
}

export async function searchBible(db: Db, translation: string, query: string): Promise<{ total: number; hits: VerseHit[] }> {
  const { data, error } = await db.rpc("search_bible", { p_translation: translation, p_query: query, p_limit: 50 });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return {
    total: Number(rows[0]?.total ?? 0),
    hits: rows.map((r) => ({
      bookCode: r.book_code as string,
      bookName: r.book_name as string,
      chapter: r.chapter as number,
      verse: r.verse as number,
      snippet: r.snippet as string,
    })),
  };
}

export type { PMNode };
