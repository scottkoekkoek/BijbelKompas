import "server-only";
/**
 * BK-039 / spec §8: the AI provider sits behind this adapter so it can be swapped (ADR-012).
 * There is NO real provider yet: the owner first chooses one and agrees that note text may go there.
 * The only implementation is "fictief": local, deterministic, free, and refused in production. It
 * exists so the whole flow (budget, job, suggestions, accept/reject) can be tested without sending
 * anything anywhere.
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

export interface AiProvider {
  /** short name, stored with every job and suggestion */
  readonly name: string;
  readonly model: string;
  /** whether text leaves this server (shown to the owner) */
  readonly external: boolean;
  estimateEur(input: AnalysisInput): number;
  analyse(input: AnalysisInput): Promise<AnalysisOutput>;
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
};

export function configuredProvider(env: Record<string, string | undefined> = process.env): AiProvider | null {
  const choice = env.AI_PROVIDER?.trim().toLowerCase();
  if (choice === "fictief" && env.VERCEL_ENV !== "production") return fictief;
  return null; // no real provider has been chosen yet
}
