import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";
import type { AiProvider, ExplainInput, Fragment, OutlineInput, OutlinePoint } from "./provider";
import { checkedSources } from "./sources";

type Db = Awaited<ReturnType<typeof createClient>>;

export type AiBudget = {
  month: string;
  limitEur: number;
  stopAtEur: number;
  usedEur: number;
  enabled: boolean;
  /** Ronde 3 §6: the budget shared by all pilot accounts together */
  pilot: { limitEur: number; stopAtEur: number; usedEur: number };
};
export type AiSuggestion = {
  id: string;
  type: "verband" | "onderwerp" | "vraag";
  status: "voorgesteld" | "geaccepteerd" | "uitgesteld" | "afgewezen" | "verouderd";
  /** one of the two notes has changed since the suggestion was made (BK-046) */
  stale: boolean;
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
  const b = data as {
    month: string; limit_eur: number; stop_at_eur: number; used_eur: number; enabled: boolean;
    pilot_limit_eur: number; pilot_stop_at_eur: number; pilot_used_eur: number;
  };
  return {
    month: b.month,
    limitEur: Number(b.limit_eur),
    stopAtEur: Number(b.stop_at_eur),
    usedEur: Number(b.used_eur),
    enabled: b.enabled,
    pilot: { limitEur: Number(b.pilot_limit_eur), stopAtEur: Number(b.pilot_stop_at_eur), usedEur: Number(b.pilot_used_eur) },
  };
}

/** Suggestions that involve a note (as source or as target), newest first, with whether they are outdated. */
export async function suggestionsForNote(db: Db, noteId: string): Promise<AiSuggestion[]> {
  const { data, error } = await db.rpc("ai_note_suggestions", { p_note_id: noteId });
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    suggestion_type: AiSuggestion["type"];
    status: AiSuggestion["status"];
    title: string;
    rationale: string;
    source_note_id: string;
    target_note_id: string | null;
    model_version: string;
    created_at: string;
    stale: boolean;
  }[];
  const others = [...new Set(rows.map((s) => (s.source_note_id === noteId ? s.target_note_id : s.source_note_id)).filter((x): x is string => !!x))];
  const titles = new Map<string, string>();
  if (others.length > 0) {
    const t = await db.from("notes").select("id, title").in("id", others);
    if (t.error) throw t.error;
    for (const n of t.data ?? []) titles.set(n.id, n.title);
  }
  return rows.map((s) => {
    const other = s.source_note_id === noteId ? s.target_note_id : s.source_note_id;
    return {
      id: s.id,
      type: s.suggestion_type,
      status: s.status,
      stale: s.stale === true,
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

export async function decide(db: Db, id: string, status: Exclude<AiSuggestion["status"], "verouderd">): Promise<boolean> {
  const { error } = await db.rpc("ai_decide", { p_id: id, p_status: status });
  if (error) {
    if (error.code === "42501") return false;
    throw error;
  }
  return true;
}

type Reservation = { ok: true; job: { id: string; status: "gereserveerd" | "klaar" } } | { ok: false; kind: "ai_off" | "budget" | "failed" };

/**
 * Reserves the estimated cost under an idempotency key. A finished job with the same key is given
 * back (nothing is paid again). After a failed attempt a new one is allowed, at most three in all,
 * so one network error does not block a question for good, and a broken provider cannot drain the budget.
 */
async function reserve(
  db: Db,
  a: { jobType: "analyse" | "vraag" | "uitleg" | "opzet"; key: string; estimate: number; provider: AiProvider; noteId?: string; revision?: number },
): Promise<Reservation> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await db
      .rpc("ai_reserve", {
        p_job_type: a.jobType,
        p_key: attempt === 1 ? a.key : `${a.key}#${attempt}`,
        p_estimate: a.estimate,
        p_provider: a.provider.name,
        p_model: a.provider.model,
        p_note_id: a.noteId ?? null,
        p_revision: a.revision ?? null,
      })
      .single();
    if (error) {
      if (error.code === "42501") return { ok: false, kind: "ai_off" };
      if (error.code === "53400") return { ok: false, kind: "budget" };
      throw error;
    }
    const job = data as { id: string; status: "gereserveerd" | "klaar" | "mislukt" };
    if (job.status !== "mislukt") return { ok: true, job: { id: job.id, status: job.status } };
  }
  return { ok: false, kind: "failed" };
}

export type AnalyseResult =
  | { ok: true; jobId: string; added: number; reused: boolean }
  | { ok: false; kind: "not_found" | "not_finished" | "ai_off" | "budget" | "failed" };

/**
 * BK-039 / spec §13.3, §8: an analysis of a finished note. Checks AI on/off, the note, the budget
 * (reserved BEFORE the provider is called) and idempotency: the same text (content hash) is never
 * analysed twice, even after finishing it again.
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

  const [{ data: doc, error: e0 }, { data: blocks, error: e1 }, { data: cands, error: e2 }] = await Promise.all([
    db.from("note_documents").select("content_hash").eq("note_id", noteId).maybeSingle(),
    db.from("note_blocks").select("plain_text").eq("note_id", noteId).order("position").limit(2000),
    db.rpc("ai_candidates", { p_note_id: noteId }),
  ]);
  if (e0) throw e0;
  if (e1) throw e1;
  if (e2) throw e2;
  const input = {
    noteId,
    title: note.title,
    text: (blocks ?? []).map((b) => b.plain_text).join("\n"),
    candidates: ((cands ?? []) as { note_id: string; title: string; reference: string }[]).map((c) => ({ noteId: c.note_id, title: c.title, reference: c.reference })),
  };

  const r = await reserve(db, {
    jobType: "analyse",
    key: `analyse:${noteId}:${doc?.content_hash ?? `r${note.current_revision}`}:${provider.name}/${provider.model}`,
    estimate: provider.estimateEur(input),
    provider,
    noteId,
    revision: note.current_revision,
  });
  if (!r.ok) return r;
  const job = r.job;
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

/**
 * Automatic analysis right after finishing, only when the owner switched it on (spec §8, §17).
 * Runs after the save has been answered; a failure never touches the note and is only logged.
 */
export async function autoAnalyse(db: Db, provider: AiProvider | null, noteId: string): Promise<AnalyseResult | null> {
  if (!provider) return null;
  const prefs = await db.from("user_preferences").select("ai_enabled, auto_analysis").maybeSingle();
  if (prefs.error) throw prefs.error;
  if (prefs.data?.ai_enabled !== true || prefs.data?.auto_analysis !== true) return null;
  return analyseNote(db, provider, noteId);
}

export type AiAnswer = {
  id: string;
  question: string;
  text: string;
  uncertain: boolean;
  model: string;
  createdAt: string;
  sources: { noteId: string; blockId: string; title: string; quote: string; revision: number; changed: boolean }[];
};

export type AskResult =
  | { ok: true; answer: AiAnswer; reused: boolean }
  | { ok: false; kind: "ai_off" | "budget" | "failed" };

type AnswerRow = { id: string; question: string; answer: string; uncertain: boolean; model_version: string; created_at: string; sources: { noteId: string; blockId: string; revision: number; blockHash: string; quote: string }[] };

/** Adds note titles to the stored sources, and whether a block has changed since the answer. */
async function toAnswer(db: Db, a: AnswerRow): Promise<AiAnswer> {
  const ids = [...new Set(a.sources.map((s) => s.noteId))];
  const [notes, blocks] = ids.length
    ? await Promise.all([
        db.from("notes").select("id, title").in("id", ids),
        db.from("note_blocks").select("note_id, block_id, content_hash").in("note_id", ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (notes.error) throw notes.error;
  if (blocks.error) throw blocks.error;
  const title = new Map((notes.data ?? []).map((n) => [n.id, n.title as string]));
  const hash = new Map((blocks.data ?? []).map((b) => [`${b.note_id}/${b.block_id}`, b.content_hash as string]));
  return {
    id: a.id,
    question: a.question,
    text: a.answer,
    uncertain: a.uncertain,
    model: a.model_version,
    createdAt: a.created_at,
    // a source whose note is gone (or no longer visible) is not shown at all
    sources: a.sources
      .filter((s) => title.has(s.noteId))
      .map((s) => ({
        noteId: s.noteId,
        blockId: s.blockId,
        title: title.get(s.noteId) || "Naamloze notitie",
        quote: s.quote,
        revision: s.revision,
        changed: hash.get(`${s.noteId}/${s.blockId}`) !== s.blockHash,
      })),
  };
}

/**
 * BK-042 / BK-043: a question to the owner's own notes. Only fragments of the owner's notes that
 * contain the words go to the provider, the cost is reserved first, and every source in the answer
 * is checked (here and again in the database) before it is stored or shown. The same question about
 * the same fragments gives the stored answer back without paying again.
 */
export async function askNotes(db: Db, provider: AiProvider, question: string): Promise<AskResult> {
  const prefs = await db.from("user_preferences").select("ai_enabled").maybeSingle();
  if (prefs.error) throw prefs.error;
  if (prefs.data?.ai_enabled !== true) return { ok: false, kind: "ai_off" };

  const { data, error } = await db.rpc("ai_fragments", { p_query: question, p_limit: 12 });
  if (error) throw error;
  const rows = (data ?? []) as { note_id: string; block_id: string; title: string; block_hash: string; plain_text: string }[];
  const fragments: Fragment[] = rows.map((r) => ({ noteId: r.note_id, blockId: r.block_id, title: r.title, text: r.plain_text }));
  const input = { question, fragments };
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([question.toLowerCase().replace(/\s+/g, " "), rows.map((r) => `${r.block_id}:${r.block_hash}`)]))
    .digest("hex")
    .slice(0, 32);

  const r = await reserve(db, { jobType: "vraag", key: `vraag:${fingerprint}:${provider.name}/${provider.model}`, estimate: provider.estimateAskEur(input), provider });
  if (!r.ok) return r;
  const job = r.job;
  if (job.status === "klaar") {
    const prev = await db.from("ai_answers").select("*").eq("job_id", job.id).maybeSingle();
    if (prev.error) throw prev.error;
    if (!prev.data) return { ok: false, kind: "failed" };
    return { ok: true, answer: await toAnswer(db, prev.data as AnswerRow), reused: true };
  }

  try {
    const out = await provider.ask(input);
    const sources = checkedSources(fragments, out.sources);
    const saved = await db
      .rpc("ai_add_answer", { p_job_id: job.id, p_question: question, p_answer: out.text, p_uncertain: out.uncertain, p_sources: sources })
      .single();
    if (saved.error) throw saved.error;
    const fin = await db.rpc("ai_finish", { p_job_id: job.id, p_ok: true, p_actual: Math.min(Math.max(out.costEur, 0), 1) });
    if (fin.error) throw fin.error;
    return { ok: true, answer: await toAnswer(db, saved.data as AnswerRow), reused: false };
  } catch (err) {
    await db.rpc("ai_finish", { p_job_id: job.id, p_ok: false, p_actual: provider.estimateAskEur(input) });
    throw err;
  }
}

/** The owner's latest answers, newest first. */
export async function recentAnswers(db: Db, limit = 5): Promise<AiAnswer[]> {
  const { data, error } = await db.from("ai_answers").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return Promise.all(((data ?? []) as AnswerRow[]).map((a) => toAnswer(db, a)));
}

export const MAX_EXPLAIN_VERSES = 30;
export type AiExplanation = {
  id: string;
  translation: string;
  label: string;
  text: string;
  crossReferences: { reference: string; reason: string }[];
  model: string;
  createdAt: string;
};
type ExplanationRow = {
  id: string;
  translation_code: string;
  passage_label: string;
  explanation: string;
  cross_references: { reference: string; reason: string }[];
  model_version: string;
  created_at: string;
};
const toExplanation = (e: ExplanationRow): AiExplanation => ({
  id: e.id,
  translation: e.translation_code,
  label: e.passage_label,
  text: e.explanation,
  crossReferences: e.cross_references,
  model: e.model_version,
  createdAt: e.created_at,
});

export type ExplainResult =
  | { ok: true; explanation: AiExplanation; reused: boolean }
  | { ok: false; kind: "ai_off" | "not_allowed" | "not_found" | "too_long" | "budget" | "failed" };

/**
 * ADR-017: an explanation of selected verses. Only text of a translation with
 * ai_processing_allowed goes to the provider (never HSV/NBV21). AI on/off and the budget come first,
 * as for every AI job; the same verses with the same text give the stored explanation back.
 */
export async function explainVerses(
  db: Db,
  provider: AiProvider,
  p: { translation: string; book: string; chapter: number; from: number; to: number },
): Promise<ExplainResult> {
  const prefs = await db.from("user_preferences").select("ai_enabled").maybeSingle();
  if (prefs.error) throw prefs.error;
  if (prefs.data?.ai_enabled !== true) return { ok: false, kind: "ai_off" };
  if (p.to - p.from + 1 > MAX_EXPLAIN_VERSES) return { ok: false, kind: "too_long" };

  const { data: t, error: e0 } = await db.from("bible_translations").select("id, code, ai_processing_allowed").eq("code", p.translation).maybeSingle();
  if (e0) throw e0;
  if (!t) return { ok: false, kind: "not_found" };
  if (t.ai_processing_allowed !== true) return { ok: false, kind: "not_allowed" };

  const wanted = Array.from({ length: p.to - p.from + 1 }, (_, i) => `${p.book}.${p.chapter}.${p.from + i}`);
  const { data: segs, error: e1 } = await db
    .from("translation_segments")
    .select("segment_key, reference_label, text")
    .eq("translation_id", t.id)
    .in("segment_key", wanted)
    .order("display_order");
  if (e1) throw e1;
  const rows = (segs ?? []) as { segment_key: string; reference_label: string; text: string }[];
  if (rows.length === 0) return { ok: false, kind: "not_found" };
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const label = rows.length === 1 ? first.reference_label : `${first.reference_label}-${last.segment_key.split(".").at(-1)}`;
  const input: ExplainInput = {
    translation: t.code,
    label,
    verses: rows.map((r) => ({ key: r.segment_key, verse: Number(r.segment_key.split(".").at(-1)), text: r.text })),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(rows.map((r) => [r.segment_key, r.text]))).digest("hex").slice(0, 24);

  const r = await reserve(db, { jobType: "uitleg", key: `uitleg:${t.code}:${fingerprint}:${provider.name}/${provider.model}`, estimate: provider.estimateExplainEur(input), provider });
  if (!r.ok) return r;
  const job = r.job;
  if (job.status === "klaar") {
    const prev = await db.from("ai_explanations").select("*").eq("job_id", job.id).maybeSingle();
    if (prev.error) throw prev.error;
    if (!prev.data) return { ok: false, kind: "failed" };
    return { ok: true, explanation: toExplanation(prev.data as ExplanationRow), reused: true };
  }

  try {
    const out = await provider.explain(input);
    const saved = await db
      .rpc("ai_add_explanation", {
        p_job_id: job.id,
        p_translation: t.code,
        p_keys: input.verses.map((v) => v.key),
        p_label: label,
        p_explanation: out.explanation,
        p_cross: out.crossReferences,
      })
      .single();
    if (saved.error) throw saved.error;
    const fin = await db.rpc("ai_finish", { p_job_id: job.id, p_ok: true, p_actual: Math.min(Math.max(out.costEur, 0), 1) });
    if (fin.error) throw fin.error;
    return { ok: true, explanation: toExplanation(saved.data as ExplanationRow), reused: false };
  } catch (err) {
    await db.rpc("ai_finish", { p_job_id: job.id, p_ok: false, p_actual: provider.estimateExplainEur(input) });
    throw err;
  }
}

export type AiOutline = {
  id: string;
  noteId: string;
  summary: string;
  mainThought: string;
  points: OutlinePoint[];
  application: string;
  model: string;
  createdAt: string;
  /** the note has changed since this outline was made */
  stale: boolean;
};
type OutlineRow = {
  id: string;
  note_id: string;
  content_hash: string;
  summary: string;
  main_thought: string;
  points: OutlinePoint[];
  application: string;
  model_version: string;
  created_at: string;
};
const toOutline = (o: OutlineRow, currentHash: string | null): AiOutline => ({
  id: o.id,
  noteId: o.note_id,
  summary: o.summary,
  mainThought: o.main_thought,
  points: o.points,
  application: o.application,
  model: o.model_version,
  createdAt: o.created_at,
  stale: currentHash !== null && o.content_hash !== currentHash,
});

async function currentHash(db: Db, noteId: string): Promise<string | null> {
  const { data, error } = await db.from("note_documents").select("content_hash").eq("note_id", noteId).maybeSingle();
  if (error) throw error;
  return data?.content_hash ?? null;
}

/** The latest outline of a note, or null. */
export async function latestOutline(db: Db, noteId: string): Promise<AiOutline | null> {
  const { data, error } = await db.from("ai_outlines").select("*").eq("note_id", noteId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toOutline(data as OutlineRow, await currentHash(db, noteId));
}

export type OutlineResult =
  | { ok: true; outline: AiOutline; reused: boolean }
  | { ok: false; kind: "not_found" | "not_finished" | "ai_off" | "budget" | "failed" };

/**
 * ADR-018: an outline and summary of a finished note, as a proposal next to it. Same order as every
 * AI job (AI on, note finished, budget reserved first); the same text is never outlined twice.
 * The note itself is never changed.
 */
export async function outlineNote(db: Db, provider: AiProvider, noteId: string): Promise<OutlineResult> {
  const prefs = await db.from("user_preferences").select("ai_enabled").maybeSingle();
  if (prefs.error) throw prefs.error;
  if (prefs.data?.ai_enabled !== true) return { ok: false, kind: "ai_off" };
  const { data: note, error } = await db.from("notes").select("id, title, note_type, status, current_revision").eq("id", noteId).maybeSingle();
  if (error) throw error;
  if (!note) return { ok: false, kind: "not_found" };
  if (note.status !== "afgerond") return { ok: false, kind: "not_finished" };

  const [hash, { data: blocks, error: e1 }] = await Promise.all([
    currentHash(db, noteId),
    db.from("note_blocks").select("plain_text").eq("note_id", noteId).order("position").limit(2000),
  ]);
  if (e1) throw e1;
  const input: OutlineInput = {
    noteId,
    title: note.title,
    noteType: note.note_type,
    text: (blocks ?? []).map((b) => b.plain_text).join("\n"),
  };

  const r = await reserve(db, {
    jobType: "opzet",
    key: `opzet:${noteId}:${hash ?? `r${note.current_revision}`}:${provider.name}/${provider.model}`,
    estimate: provider.estimateOutlineEur(input),
    provider,
    noteId,
    revision: note.current_revision,
  });
  if (!r.ok) return r;
  const job = r.job;
  if (job.status === "klaar") {
    const prev = await db.from("ai_outlines").select("*").eq("job_id", job.id).maybeSingle();
    if (prev.error) throw prev.error;
    if (!prev.data) return { ok: false, kind: "failed" };
    return { ok: true, outline: toOutline(prev.data as OutlineRow, hash), reused: true };
  }

  try {
    const out = await provider.outline(input);
    const saved = await db
      .rpc("ai_add_outline", { p_job_id: job.id, p_summary: out.summary, p_main_thought: out.mainThought, p_points: out.points, p_application: out.application })
      .single();
    if (saved.error) throw saved.error;
    const fin = await db.rpc("ai_finish", { p_job_id: job.id, p_ok: true, p_actual: Math.min(Math.max(out.costEur, 0), 1) });
    if (fin.error) throw fin.error;
    return { ok: true, outline: toOutline(saved.data as OutlineRow, hash), reused: false };
  } catch (err) {
    await db.rpc("ai_finish", { p_job_id: job.id, p_ok: false, p_actual: provider.estimateOutlineEur(input) });
    throw err;
  }
}

// Ronde 3 §5: the summary saved with its source note -----------------------------------------
export type NoteSummarySection = {
  noteId: string;
  outlineId: string | null;
  summary: string;
  mainThought: string;
  points: OutlinePoint[];
  application: string;
  model: string;
  savedAt: string;
  /** the note version it was made from, and the note's version now */
  sourceRevision: number;
  currentRevision: number;
  /** the note's text changed after the summary was made */
  stale: boolean;
};
type SummaryRow = {
  note_id: string;
  outline_id: string | null;
  source_revision: number;
  content_hash: string;
  summary: string;
  main_thought: string;
  points: OutlinePoint[];
  application: string;
  model_version: string;
  saved_at: string;
};

export async function getNoteSummary(db: Db, noteId: string): Promise<NoteSummarySection | null> {
  const [s, note, hash] = await Promise.all([
    db.from("note_summaries").select("*").eq("note_id", noteId).maybeSingle(),
    db.from("notes").select("current_revision").eq("id", noteId).maybeSingle(),
    currentHash(db, noteId),
  ]);
  if (s.error) throw s.error;
  if (note.error) throw note.error;
  if (!s.data) return null;
  const r = s.data as SummaryRow;
  return {
    noteId: r.note_id,
    outlineId: r.outline_id,
    summary: r.summary,
    mainThought: r.main_thought,
    points: r.points,
    application: r.application,
    model: r.model_version,
    savedAt: new Date(r.saved_at).toISOString(),
    sourceRevision: r.source_revision,
    currentRevision: note.data?.current_revision ?? r.source_revision,
    stale: hash !== null && r.content_hash !== hash,
  };
}

/** Saves (or deliberately replaces) the note's summary from one of its outlines. */
export async function saveNoteSummary(db: Db, noteId: string, outlineId: string): Promise<NoteSummarySection | null> {
  const { error } = await db.rpc("save_note_summary", { p_note_id: noteId, p_outline_id: outlineId });
  if (error) {
    if (error.code === "42501") return null;
    throw error;
  }
  return getNoteSummary(db, noteId);
}

export async function deleteNoteSummary(db: Db, noteId: string): Promise<boolean> {
  const { data, error } = await db.rpc("delete_note_summary", { p_note_id: noteId });
  if (error) throw error;
  return data === true;
}
