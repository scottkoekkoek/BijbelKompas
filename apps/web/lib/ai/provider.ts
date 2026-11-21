import "server-only";
import { claudeFromEnv } from "./claude";
/**
 * BK-039 / spec §8: the AI provider sits behind this adapter so it can be swapped (ADR-012).
 * "claude" (ADR-016) is the real provider: only with AI_PROVIDER=claude and the secret
 * ANTHROPIC_API_KEY, after the owner agreed that note text may go to Anthropic.
 * "fictief" is local, deterministic, free, and refused in production. It exists so the whole flow
 * (budget, job, suggestions, accept/reject) can be tested without sending anything anywhere.
 */

export type Candidate = { noteId: string; title: string; reference: string };
export type AnalysisInput = { noteId: string; title: string; text: string; candidates: Candidate[] };
export type ProposedSuggestion = {
  type: "verband";
  targetNoteId: string;
  title: string;
  rationale: string;
  evidence: { noteId: string; reference: string }[];
};
export type AnalysisOutput = { suggestions: ProposedSuggestion[]; costEur: number };

/** A block of one of the owner's notes that a question may be answered from (BK-042). */
export type Fragment = { noteId: string; blockId: string; title: string; text: string };
export type AskInput = { question: string; fragments: Fragment[] };
/** Each source must point at a given fragment and quote it literally; the server checks this (BK-043). */
export type AskOutput = {
  text: string;
  uncertain: boolean;
  sources: { noteId: string; blockId: string; quote: string }[];
  costEur: number;
};

/** ADR-017: verses of a translation that may be processed by AI (never HSV/NBV21). */
export type ExplainInput = { translation: string; label: string; verses: { key: string; verse: number; text: string }[] };
export type ExplainOutput = { explanation: string; crossReferences: { reference: string; reason: string }[]; costEur: number };

/** ADR-018: an outline/summary of one finished note, as a proposal next to it. */
export type OutlineInput = { noteId: string; title: string; noteType: string; text: string };
export type OutlinePoint = { heading: string; details: string[] };
export type OutlineOutput = { summary: string; mainThought: string; points: OutlinePoint[]; application: string; costEur: number };

export interface AiProvider {
  /** short name, stored with every job and suggestion */
  readonly name: string;
  readonly model: string;
  /** whether text leaves this server (shown to the owner) */
  readonly external: boolean;
  estimateEur(input: AnalysisInput): number;
  analyse(input: AnalysisInput): Promise<AnalysisOutput>;
  estimateAskEur(input: AskInput): number;
  ask(input: AskInput): Promise<AskOutput>;
  estimateExplainEur(input: ExplainInput): number;
  explain(input: ExplainInput): Promise<ExplainOutput>;
  estimateOutlineEur(input: OutlineInput): number;
  outline(input: OutlineInput): Promise<OutlineOutput>;
}

/** The first sentence of a text (at most 200 characters), taken literally so it can be checked. */
export function firstSentence(text: string): string {
  const t = text.trim();
  const end = t.search(/[.!?](\s|$)/);
  return (end >= 0 ? t.slice(0, end + 1) : t).slice(0, 200).trim();
}

/** Local stand-in: proposes links between notes about the same verses. Reads no instructions from the text (AT-17). */
const fictief: AiProvider = {
  name: "fictief",
  model: "lokaal-1",
  external: false,
  estimateEur: () => 0.01,
  async analyse(input) {
    return {
      costEur: 0.001,
      suggestions: input.candidates.slice(0, 10).map((c) => ({
        type: "verband",
        targetNoteId: c.noteId,
        title: c.title || "Naamloze notitie",
        rationale: `Beide notities gaan over ${c.reference}.`,
        evidence: [{ noteId: c.noteId, reference: c.reference }],
      })),
    };
  },
  estimateAskEur: () => 0.01,
  /** Does not answer anything itself: it only points at the fragments that contain the words. */
  async ask(input) {
    const used = input.fragments.filter((f) => f.text.trim()).slice(0, 3);
    if (used.length === 0) return { costEur: 0.001, uncertain: true, sources: [], text: "Hierover staat niets in je notities." };
    const titles = [...new Set(used.map((f) => `“${f.title || "Naamloze notitie"}”`))].join(", ");
    return {
      costEur: 0.001,
      uncertain: false,
      text: `Testantwoord: je schreef hierover in ${titles}. Lees de bronnen hieronder.`,
      sources: used.map((f) => ({ noteId: f.noteId, blockId: f.blockId, quote: firstSentence(f.text) })),
    };
  },
  estimateExplainEur: () => 0.01,
  /** Explains nothing: only says which verses it got, so the flow can be tested. */
  async explain(input) {
    return {
      costEur: 0.001,
      explanation: `Testuitleg bij ${input.label} (${input.verses.length} ${input.verses.length === 1 ? "vers" : "verzen"}). Er is niets verstuurd.`,
      crossReferences: [{ reference: "Johannes 1:1", reason: "Testverwijzing." }],
    };
  },
  estimateOutlineEur: () => 0.01,
  /** Makes no outline of its own: only repeats the first sentence, so the flow can be tested. */
  async outline(input) {
    const first = firstSentence(input.text) || "Lege notitie.";
    return {
      costEur: 0.001,
      summary: `Testsamenvatting van “${input.title || "Naamloze notitie"}”. Er is niets verstuurd.`,
      mainThought: first,
      points: [{ heading: "Testpunt", details: [first] }],
      application: "Testtoepassing.",
    };
  },
};

export function configuredProvider(env: Record<string, string | undefined> = process.env): AiProvider | null {
  const choice = env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === "fictief" && env.VERCEL_ENV !== "production") return fictief;
  if (choice === "claude") return claudeFromEnv(env);
  return null; // nothing chosen: nothing is sent anywhere
}
