/**
 * BK-054: collects everything of the signed-in owner (through RLS, so never someone else's data)
 * and packs it as a zip: bijbelkompas.json + one Markdown file per note.
 */
import { EMPTY_SERMON, type NoteType, type SermonDetails } from "@bk/schemas";
import { strToU8, zipSync } from "fflate";
import type { createClient } from "@/lib/supabase/server";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  linksOf,
  markdownFileName,
  noteToMarkdown,
  readme,
  type ExportData,
  type ExportNote,
  type ExportRevision,
} from "./format";

type Db = Awaited<ReturnType<typeof createClient>>;
const PAGE = 500;

/** All rows of a query, page by page (the API returns at most 1000 rows per request). */
async function all<T>(run: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type NoteRow = {
  id: string; title: string; note_type: NoteType; status: "concept" | "afgerond"; event_date: string | null;
  created_at: string; updated_at: string; completed_at: string | null; archived_at: string | null; document_version: number;
};
type RevisionRow = { note_id: string; revision_number: number; reason: string; created_at: string; metadata_json: unknown; content_hash: string; document_json: unknown };
type SermonRow = { note_id: string; service_type: string | null; speaker: { name: string } | null; organization: { name: string } | null; series: { name: string } | null };

export async function collectExport(db: Db, now = new Date()): Promise<ExportData> {
  const [notes, docs, revisions, sermons, templates, prefs, position, collections, collectionItems, questions, questionNotes, questionPassages, highlights] = await Promise.all([
    all<NoteRow>((a, b) =>
      db.from("notes")
        .select("id, title, note_type, status, event_date, created_at, updated_at, completed_at, archived_at, document_version")
        // Ronde 3 §3: drafts in the trash are not part of the export
        .is("deleted_at", null)
        .order("created_at").order("id").range(a, b),
    ),
    all<{ note_id: string; document_json: ExportNote["document"] }>((a, b) =>
      db.from("note_documents").select("note_id, document_json").order("note_id").range(a, b),
    ),
    all<RevisionRow>((a, b) =>
      db.from("note_revisions")
        .select("note_id, revision_number, reason, created_at, metadata_json, content_hash, document_json")
        .order("note_id").order("revision_number").range(a, b),
    ),
    all<SermonRow>((a, b) =>
      db.from("sermon_details")
        .select("note_id, service_type, speaker:speakers(name), organization:organizations(name), series:sermon_series(name)")
        .order("note_id").range(a, b),
    ),
    all<unknown>((a, b) =>
      db.from("note_templates")
        .select("id, name, note_type, description, template_json, template_version, archived_at, created_at, updated_at")
        .order("created_at").range(a, b),
    ),
    db.from("user_preferences").select("theme, bible_font_size, offline_recent_limit, ai_enabled, auto_analysis, editor_preferences, translation:bible_translations(code)").maybeSingle(),
    db.from("reading_positions").select("chapter_number, updated_at, translation:bible_translations(code), book:bible_books(book_code)").maybeSingle(),
    all<unknown>((a, b) =>
      db.from("collections")
        .select("id, parent_id, name, collection_type, description, created_at, updated_at, archived_at")
        .order("created_at").order("id").range(a, b),
    ),
    all<unknown>((a, b) =>
      db.from("collection_items").select("collection_id, note_id, position, created_at").order("collection_id").order("position").order("note_id").range(a, b),
    ),
    all<unknown>((a, b) =>
      db.from("questions")
        .select("id, title, description, status, answer, created_at, updated_at, resolved_at")
        .order("created_at").order("id").range(a, b),
    ),
    all<unknown>((a, b) => db.from("question_notes").select("question_id, note_id, created_at").order("question_id").order("note_id").range(a, b)),
    all<unknown>((a, b) =>
      db.from("question_passages")
        .select("id, question_id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, created_at")
        .order("question_id").order("id").range(a, b),
    ),
    all<unknown>((a, b) =>
      db.from("highlights")
        .select("id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse, color, annotation, created_at, updated_at")
        .order("start_order").order("id").range(a, b),
    ),
  ]);
  if (prefs.error) throw prefs.error;
  if (position.error) throw position.error;

  const docById = new Map(docs.map((d) => [d.note_id, d.document_json]));
  const sermonById = new Map(sermons.map((s) => [s.note_id, s]));
  const revsById = new Map<string, ExportRevision[]>();
  for (const r of revisions) {
    const list = revsById.get(r.note_id) ?? [];
    list.push({ number: r.revision_number, reason: r.reason, createdAt: r.created_at, metadata: r.metadata_json, contentHash: r.content_hash, document: r.document_json });
    revsById.set(r.note_id, list);
  }

  // links to drafts in the trash stay out too, so the export can be put back without gaps
  const kept = new Set(notes.map((n) => n.id));
  const keptLink = (r: unknown) => kept.has((r as { note_id: string }).note_id);

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    notes: notes.map((n): ExportNote => {
      const document = docById.get(n.id) ?? { type: "doc", content: [] };
      const s = sermonById.get(n.id);
      const sermon: SermonDetails | null = s
        ? { ...EMPTY_SERMON, speaker: s.speaker?.name ?? null, organization: s.organization?.name ?? null, series: s.series?.name ?? null, serviceType: s.service_type }
        : null;
      return {
        id: n.id,
        title: n.title,
        noteType: n.note_type,
        status: n.status,
        eventDate: n.event_date,
        createdAt: new Date(n.created_at).toISOString(),
        updatedAt: new Date(n.updated_at).toISOString(),
        completedAt: n.completed_at && new Date(n.completed_at).toISOString(),
        archivedAt: n.archived_at && new Date(n.archived_at).toISOString(),
        documentVersion: n.document_version,
        sermon,
        document,
        passageLinks: linksOf(document),
        revisions: revsById.get(n.id) ?? [],
      };
    }),
    templates,
    preferences: prefs.data,
    readingPosition: position.data,
    collections,
    collectionItems: collectionItems.filter(keptLink),
    questions,
    questionNotes: questionNotes.filter(keptLink),
    questionPassages,
    highlights,
  };
}

/** The zip file (bytes) for an export. */
export function packExport(data: ExportData): Uint8Array {
  const used = new Set<string>();
  const files: Record<string, Uint8Array> = {
    "LEESMIJ.md": strToU8(readme(data)),
    "bijbelkompas.json": strToU8(JSON.stringify(data, null, 2)),
  };
  for (const n of data.notes) files[`notities/${markdownFileName(n, used)}`] = strToU8(noteToMarkdown(n));
  return zipSync(files, { level: 6 });
}
