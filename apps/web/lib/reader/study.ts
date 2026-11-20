import "server-only";
import type { NoteType, QuestionStatus } from "@bk/schemas";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export type StudyQuery = { translation: string; book: string; chapter: number; from: number; to: number };
export type StudyNote = { id: string; title: string; noteType: NoteType; references: string[]; blockId: string | null };
export type StudyQuestion = { id: string; title: string; status: QuestionStatus; label: string };
export type Study = { notes: StudyNote[]; questions: StudyQuestion[] };

/**
 * Features 1 and 5: the owner's own notes and research questions linked to these verses, including
 * links that only partly overlap them. Each note and question appears once. Both database
 * functions only return the signed-in owner's rows (RLS and an explicit owner filter).
 */
export async function passageStudy(db: Db, q: StudyQuery): Promise<Study> {
  const args = { p_translation: q.translation, p_book: q.book, p_chapter: q.chapter, p_start_verse: q.from, p_end_verse: q.to };
  const [n, qs] = await Promise.all([db.rpc("passage_notes", args), db.rpc("passage_questions", args)]);
  if (n.error) throw n.error;
  if (qs.error) throw qs.error;
  const notes = new Map<string, StudyNote>();
  for (const r of (n.data ?? []) as { note_id: string; title: string; note_type: NoteType; block_id: string | null; reference_text: string }[]) {
    const seen = notes.get(r.note_id);
    if (seen) {
      if (r.reference_text && !seen.references.includes(r.reference_text)) seen.references.push(r.reference_text);
    } else {
      notes.set(r.note_id, { id: r.note_id, title: r.title, noteType: r.note_type, references: r.reference_text ? [r.reference_text] : [], blockId: r.block_id });
    }
  }
  const questions = ((qs.data ?? []) as { question_id: string; title: string; status: QuestionStatus; label: string }[]).map((r) => ({
    id: r.question_id,
    title: r.title,
    status: r.status,
    label: r.label,
  }));
  return { notes: [...notes.values()], questions };
}
