import "server-only";
/**
 * Sprint 7 data access: collections, research questions and the timeline (BK-047..BK-053).
 * Everything runs with the signed-in user's session, so RLS limits it to their own rows.
 */
import type {
  Collection,
  CollectionInput,
  CollectionType,
  CollectionUpdate,
  NoteStatus,
  NoteSummary,
  NoteType,
  Question,
  QuestionInput,
  QuestionPassage,
  QuestionStatus,
  QuestionUpdate,
} from "@bk/schemas";
import { NOTE_COLUMNS, toSummary, type NoteRow } from "@/lib/notes/data";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Database errors the API maps to a user message: invalid input (bad parent, cycle, unknown verse). */
export const isInvalid = (e: unknown) => ["22023", "23514", "23505", "23503"].includes((e as { code?: string })?.code ?? "");

// collections --------------------------------------------------------------------------------
type CollectionRow = {
  id: string;
  parent_id: string | null;
  name: string;
  collection_type: CollectionType;
  description: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  collection_items?: { count: number }[];
};
const COLLECTION_COLUMNS = "id, parent_id, name, collection_type, description, archived_at, created_at, updated_at, collection_items(count)";

const toCollection = (r: CollectionRow): Collection => ({
  id: r.id,
  parentId: r.parent_id,
  name: r.name,
  collectionType: r.collection_type,
  description: r.description,
  archived: r.archived_at !== null,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  noteCount: r.collection_items?.[0]?.count ?? 0,
});

export async function listCollections(db: Db, archived = false): Promise<Collection[]> {
  let q = db.from("collections").select(COLLECTION_COLUMNS).order("name").limit(1000);
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data as unknown as CollectionRow[]).map(toCollection);
}

export async function getCollection(db: Db, id: string): Promise<Collection | null> {
  const { data, error } = await db.from("collections").select(COLLECTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toCollection(data as unknown as CollectionRow) : null;
}

export async function createCollection(db: Db, c: CollectionInput): Promise<Collection> {
  const { data, error } = await db
    .from("collections")
    .insert({ name: c.name, collection_type: c.collectionType, description: c.description, parent_id: c.parentId })
    .select(COLLECTION_COLUMNS)
    .single();
  if (error) throw error;
  return toCollection(data as unknown as CollectionRow);
}

export async function updateCollection(db: Db, id: string, c: CollectionUpdate): Promise<Collection | null> {
  const patch: Record<string, unknown> = {};
  if (c.name !== undefined) patch.name = c.name;
  if (c.collectionType !== undefined) patch.collection_type = c.collectionType;
  if (c.description !== undefined) patch.description = c.description;
  if (c.parentId !== undefined) patch.parent_id = c.parentId;
  if (c.archived !== undefined) patch.archived_at = c.archived ? new Date().toISOString() : null;
  const { data, error } = await db.from("collections").update(patch).eq("id", id).select(COLLECTION_COLUMNS).maybeSingle();
  if (error) throw error;
  return data ? toCollection(data as unknown as CollectionRow) : null;
}

/** The notes of a collection in their order. */
export async function collectionNotes(db: Db, id: string): Promise<NoteSummary[]> {
  const { data, error } = await db
    .from("collection_items")
    .select(`position, note:notes(${NOTE_COLUMNS})`)
    .eq("collection_id", id)
    .order("position")
    .order("created_at")
    .limit(1000);
  if (error) throw error;
  return (data as unknown as { note: NoteRow | null }[]).filter((r) => r.note).map((r) => toSummary(r.note!));
}

export async function addToCollection(db: Db, collectionId: string, noteId: string): Promise<void> {
  const { data: last } = await db
    .from("collection_items")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await db.from("collection_items").insert({ collection_id: collectionId, note_id: noteId, position: (last?.position ?? -1) + 1 });
  if (error && error.code !== "23505") throw error; // already in it: nothing to do
}

export async function removeFromCollection(db: Db, collectionId: string, noteId: string): Promise<void> {
  const { error } = await db.rpc("remove_collection_item", { p_collection_id: collectionId, p_note_id: noteId });
  if (error) throw error;
}

export async function reorderCollection(db: Db, collectionId: string, noteIds: string[]): Promise<void> {
  const { error } = await db.rpc("reorder_collection", { p_collection_id: collectionId, p_note_ids: noteIds });
  if (error) throw error;
}

/** Ids of the collections a note is in (for the note page). */
export async function collectionsOfNote(db: Db, noteId: string): Promise<string[]> {
  const { data, error } = await db.from("collection_items").select("collection_id").eq("note_id", noteId);
  if (error) throw error;
  return (data ?? []).map((r) => r.collection_id as string);
}

/** For offline pinning: the note ids of the given collections and their subcollections. */
export async function offlineCollections(db: Db, ids: string[]): Promise<{ id: string; name: string; noteIds: string[] }[]> {
  const all = await listCollections(db);
  const { data, error } = await db.from("collection_items").select("collection_id, note_id").limit(10000);
  if (error) throw error;
  const items = (data ?? []) as { collection_id: string; note_id: string }[];
  return ids.flatMap((id) => {
    const root = all.find((c) => c.id === id);
    if (!root) return [];
    const tree = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const c of all) if (c.parentId && tree.has(c.parentId) && !tree.has(c.id)) grew = Boolean(tree.add(c.id));
    }
    const noteIds = [...new Set(items.filter((i) => tree.has(i.collection_id)).map((i) => i.note_id))];
    return [{ id, name: root.name, noteIds }];
  });
}

// questions ----------------------------------------------------------------------------------
type QuestionRow = {
  id: string;
  title: string;
  description: string;
  status: QuestionStatus;
  answer: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};
const QUESTION_COLUMNS = "id, title, description, status, answer, created_at, updated_at, resolved_at";
const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  title: r.title,
  description: r.description,
  status: r.status,
  answer: r.answer,
  createdAt: new Date(r.created_at).toISOString(),
  updatedAt: new Date(r.updated_at).toISOString(),
  resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
});

/** No status: everything except archived (the API). "lopend": open and in research (audit BK-04). */
export async function listQuestions(db: Db, status?: QuestionStatus | "lopend"): Promise<Question[]> {
  let q = db.from("questions").select(QUESTION_COLUMNS).order("updated_at", { ascending: false }).limit(500);
  q = status === "lopend" ? q.in("status", ["open", "in_onderzoek"]) : status ? q.eq("status", status) : q.neq("status", "gearchiveerd");
  const { data, error } = await q;
  if (error) throw error;
  return (data as QuestionRow[]).map(toQuestion);
}

export async function getQuestion(db: Db, id: string): Promise<Question | null> {
  const { data, error } = await db.from("questions").select(QUESTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toQuestion(data as QuestionRow) : null;
}

export async function createQuestion(db: Db, q: QuestionInput): Promise<Question> {
  const { data, error } = await db.from("questions").insert({ title: q.title, description: q.description }).select(QUESTION_COLUMNS).single();
  if (error) throw error;
  const question = toQuestion(data as QuestionRow);
  // feature 3: a question asked from a verse selection is linked to exactly that passage
  if (q.passage && q.label) await addQuestionPassage(db, question.id, { ...q.passage, label: q.label });
  return question;
}

export async function updateQuestion(db: Db, id: string, q: QuestionUpdate): Promise<Question | null> {
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "status", "answer"] as const) if (q[k] !== undefined) patch[k] = q[k];
  const { data, error } = await db.from("questions").update(patch).eq("id", id).select(QUESTION_COLUMNS).maybeSingle();
  if (error) throw error;
  return data ? toQuestion(data as QuestionRow) : null;
}

export async function questionLinks(db: Db, id: string): Promise<{ notes: NoteSummary[]; passages: QuestionPassage[] }> {
  const [notes, passages] = await Promise.all([
    db.from("question_notes").select(`created_at, note:notes(${NOTE_COLUMNS})`).eq("question_id", id).order("created_at"),
    db
      .from("question_passages")
      .select("id, label, translation, book, start_chapter, start_verse, end_chapter, end_verse")
      .eq("question_id", id)
      .order("start_order"),
  ]);
  if (notes.error) throw notes.error;
  if (passages.error) throw passages.error;
  return {
    notes: (notes.data as unknown as { note: NoteRow | null }[]).filter((r) => r.note).map((r) => toSummary(r.note!)),
    passages: (passages.data ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      translation: p.translation,
      book: p.book,
      startChapter: p.start_chapter,
      startVerse: p.start_verse,
      endChapter: p.end_chapter,
      endVerse: p.end_verse,
    })),
  };
}

export async function linkQuestionNote(db: Db, questionId: string, noteId: string, linked: boolean): Promise<void> {
  if (linked) {
    const { error } = await db.from("question_notes").insert({ question_id: questionId, note_id: noteId });
    if (error && error.code !== "23505") throw error;
  } else {
    const { error } = await db.rpc("unlink_question_note", { p_question_id: questionId, p_note_id: noteId });
    if (error) throw error;
  }
}

export async function addQuestionPassage(db: Db, questionId: string, passage: Omit<QuestionPassage, "id">): Promise<void> {
  const { error } = await db.rpc("add_question_passage", { p_question_id: questionId, p_passage: passage });
  if (error) throw error;
}

export async function removeQuestionPassage(db: Db, questionId: string, passageId: string): Promise<void> {
  const { error } = await db.rpc("remove_question_passage", { p_question_id: questionId, p_passage_id: passageId });
  if (error) throw error;
}

/** Questions a note is linked to (shown on the note page). */
export async function questionsOfNote(db: Db, noteId: string): Promise<Pick<Question, "id" | "title" | "status">[]> {
  const { data, error } = await db.from("question_notes").select("question:questions(id, title, status)").eq("note_id", noteId);
  if (error) throw error;
  return (data as unknown as { question: Pick<Question, "id" | "title" | "status"> | null }[]).flatMap((r) => (r.question ? [r.question] : []));
}

// timeline -----------------------------------------------------------------------------------
export type TimelineFilters = {
  from?: string;
  to?: string;
  type?: NoteType;
  status?: NoteStatus;
  speaker?: string;
  book?: string;
  collection?: string;
};
export type TimelineEntry = {
  id: string;
  title: string;
  noteType: NoteType;
  status: NoteStatus;
  date: string;
  hasEventDate: boolean;
  createdAt: string;
  updatedAt: string;
  speaker: string | null;
};

export async function timeline(db: Db, f: TimelineFilters): Promise<TimelineEntry[]> {
  const { data, error } = await db.rpc("timeline_notes", {
    p_from: f.from ?? null,
    p_to: f.to ?? null,
    p_type: f.type ?? null,
    p_status: f.status ?? null,
    p_speaker: f.speaker ?? null,
    p_book: f.book ?? null,
    p_collection: f.collection ?? null,
    p_limit: 500,
  });
  if (error) throw error;
  return (
    data as {
      note_id: string;
      title: string;
      note_type: NoteType;
      status: NoteStatus;
      event_date: string;
      has_event_date: boolean;
      created_at: string;
      updated_at: string;
      speaker: string | null;
    }[]
  ).map((r) => ({
    id: r.note_id,
    title: r.title,
    noteType: r.note_type,
    status: r.status,
    date: r.event_date,
    hasEventDate: r.has_event_date,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    speaker: r.speaker,
  }));
}
