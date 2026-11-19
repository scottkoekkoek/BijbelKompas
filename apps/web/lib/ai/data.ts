import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { AiProvider } from "./provider";

type Db = Awaited<ReturnType<typeof createClient>>;

export type AiBudget = { month: string; limitEur: number; stopAtEur: number; usedEur: number; enabled: boolean };
export type AiSuggestion = {
  id: string;
  type: "verband" | "onderwerp" | "vraag";
  status: "voorgesteld" | "geaccepteerd" | "uitgesteld" | "afgewezen";
  title: string;
  rationale: string;
  targetNoteId: string | null;
  sourceNoteId: string;
  model: string;
  createdAt: string;
  /** the other note of a link, seen from the note asked about */
  otherNoteId: string | null;
  otherTitle: string | null;
};

export async function getBudget(db: Db): Promise<AiBudget> {
  const { data, error } = await db.rpc("ai_budget").single();
  if (error) throw error;
  const b = data as { month: string; limit_eur: number; stop_at_eur: number; used_eur: number; enabled: boolean };
  return { month: b.month, limitEur: Number(b.limit_eur), stopAtEur: Number(b.stop_at_eur), usedEur: Number(b.used_eur), enabled: b.enabled };
}

/** Suggestions that involve a note (as source or as target), newest first. */
export async function suggestionsForNote(db: Db, noteId: string): Promise<AiSuggestion[]> {
  const { data, error } = await db
    .from("ai_suggestions")
    .select("id, suggestion_type, status, title, rationale, target_note_id, source_note_id, model_version, created_at")
    .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const others = [...new Set((data ?? []).map((s) => (s.source_note_id === noteId ? s.target_note_id : s.source_note_id)).filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  if (others.length > 0) {
    const t = await db.from("notes").select("id, title").in("id", others);
    if (t.error) throw t.error;
    for (const n of t.data ?? []) titles.set(n.id, n.title);
  }
  return (data ?? []).map((s) => {
    const other = s.source_note_id === noteId ? s.target_note_id : s.source_note_id;
    return {
    id: s.id,
    type: s.suggestion_type,
    status: s.status,
    title: s.title,
    rationale: s.rationale,
    targetNoteId: s.target_note_id,
    sourceNoteId: s.source_note_id,
    model: s.model_version,
    createdAt: s.created_at,
    otherNoteId: other,
    otherTitle: other ? (titles.get(other) ?? null) : null,
    };
  });
}

export async function decide(db: Db, id: string, status: AiSuggestion["status"]): Promise<boolean> {
  const { error } = await db.rpc("ai_decide", { p_id: id, p_status: status });
  if (error) {
    if (error.code === "42501") return false;
    throw error;
  }
  return true;
}

export type AnalyseResult =
  | { ok: true; jobId: string; added: number; reused: boolean }
  | { ok: false; kind: "not_found" | "not_finished" | "ai_off" | "budget" };

/**
 * BK-039 / spec §13.3: an analysis of a finished note. Checks AI on/off, the note, the budget
 * (reserved BEFORE the provider is called) and idempotency (same note revision = same job).
 * The result can only become suggestions; the note itself is never changed.
 */
export async function analyseNote(db: Db, provider: AiProvider, noteId: string): Promise<AnalyseResult> {
  // AI off comes first: then nothing is read for AI at all (BK-044)
  const prefs = await db.from("user_preferences").select("ai_enabled").maybeSingle();
  if (prefs.error) throw prefs.error;
  if (prefs.data?.ai_enabled !== true) return { ok: false, kind: "ai_off" };
  const { data: note, error } = await db.from("notes").select("id, title, status, current_revision").eq("id", noteId).maybeSingle();
  if (error) throw error;
  if (!note) return { ok: false, kind: "not_found" };
  if (note.status !== "afgerond") return { ok: false, kind: "not_finished" };

  const [{ data: blocks, error: e1 }, { data: cands, error: e2 }] = await Promise.all([
    db.from("note_blocks").select("plain_text").eq("note_id", noteId).order("position").limit(2000),
    db.rpc("ai_candidates", { p_note_id: noteId }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const input = {
    noteId,
    title: note.title,
    text: (blocks ?? []).map((b) => b.plain_text).join("\n"),
    candidates: ((cands ?? []) as { note_id: string; title: string; reference: string }[]).map((c) => ({ noteId: c.note_id, title: c.title, reference: c.reference })),
  };

  const reserved = await db
    .rpc("ai_reserve", {
      p_job_type: "analyse",
      p_key: `analyse:${noteId}:r${note.current_revision}:${provider.name}/${provider.model}`,
      p_estimate: provider.estimateEur(input),
      p_provider: provider.name,
      p_model: provider.model,
      p_note_id: noteId,
      p_revision: note.current_revision,
    })
    .single();
  if (reserved.error) {
    if (reserved.error.code === "42501") return { ok: false, kind: "ai_off" };
    if (reserved.error.code === "53400") return { ok: false, kind: "budget" };
    throw reserved.error;
  }
  const job = reserved.data as { id: string; status: string };
  if (job.status !== "gereserveerd") return { ok: true, jobId: job.id, added: 0, reused: true };

  try {
    const out = await provider.analyse(input);
    const { data: added, error: e3 } = await db.rpc("ai_add_suggestions", { p_job_id: job.id, p: out.suggestions });
    if (e3) throw e3;
    const fin = await db.rpc("ai_finish", { p_job_id: job.id, p_ok: true, p_actual: Math.min(Math.max(out.costEur, 0), 1) });
    if (fin.error) throw fin.error;
    return { ok: true, jobId: job.id, added: added as number, reused: false };
  } catch (err) {
    // the reservation counts as spent: what a failed call cost is not known
    await db.rpc("ai_finish", { p_job_id: job.id, p_ok: false, p_actual: provider.estimateEur(input) });
    throw err;
  }
}
