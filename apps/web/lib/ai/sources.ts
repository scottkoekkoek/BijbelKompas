import type { AskOutput, Fragment } from "./provider";

/**
 * BK-043 / AT-11: a source counts only when it points at a fragment that was actually given to the
 * provider and quotes that fragment literally. Everything else is dropped. The database checks the
 * same again against the owner's own blocks before anything is stored or shown.
 */
export function checkedSources(fragments: Fragment[], sources: AskOutput["sources"]): AskOutput["sources"] {
  const byBlock = new Map(fragments.map((f) => [`${f.noteId}/${f.blockId}`, f]));
  const seen = new Set<string>();
  const out: AskOutput["sources"] = [];
  for (const s of sources.slice(0, 10)) {
    const key = `${s.noteId}/${s.blockId}`;
    const f = byBlock.get(key);
    const quote = (s.quote ?? "").trim().slice(0, 300);
    if (!f || !quote || !f.text.includes(quote) || seen.has(key)) continue;
    seen.add(key);
    out.push({ noteId: s.noteId, blockId: s.blockId, quote });
  }
  return out;
}
