/**
 * BK-032 / AT-03: verse links stay with their text while editing.
 *
 * Rules (deterministic, see ADR-007):
 * - Links live in the block's own `passages` attribute, so editing other blocks never moves them.
 * - Splitting a block: the first part keeps the block id and its links; the new part starts without.
 *   Exception: Enter at the very start leaves an empty first part; then the links go with the text.
 * - Joining blocks: the surviving block gets the links of every block whose text it took over.
 * - Deleting a block's text entirely removes its links (they stay in the version history).
 * Pure ProseMirror (no DOM, no React), so it is unit-tested directly.
 */
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { MAX_PASSAGES_PER_BLOCK, samePassage, type LinkedPassage } from "./document";

export const passageLinksKey = new PluginKey("passageLinks");

type Linked = { from: number; to: number; blockId: string; passages: LinkedPassage[] };

function linkedBlocks(state: EditorState): Linked[] {
  const out: Linked[] = [];
  state.doc.forEach((node, offset) => {
    const passages = node.attrs.passages as LinkedPassage[] | null | undefined;
    if (passages?.length) out.push({ from: offset, to: offset + node.nodeSize, blockId: node.attrs.blockId as string, passages });
  });
  return out;
}

export function mergePassages(a: LinkedPassage[], b: LinkedPassage[]): LinkedPassage[] {
  const out = [...a];
  for (const p of b) if (!out.some((q) => samePassage(p, q))) out.push(p);
  return out.slice(0, MAX_PASSAGES_PER_BLOCK);
}

/**
 * Moves links along with their text: from blocks that disappeared into the block that took over their
 * text (a join), and from a block that became empty into the block now holding all of its old text
 * (Enter at the very start of a linked block).
 */
export function carryOverLinks(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  if (!trs.some((t) => t.docChanged)) return null;
  const before = linkedBlocks(oldState);
  if (before.length === 0) return null;
  const indexById = new Map<string, number>();
  newState.doc.forEach((n, _o, i) => indexById.set(n.attrs.blockId as string, i));
  const mapping = new Mapping();
  for (const t of trs) mapping.appendMapping(t.mapping);
  const size = newState.doc.content.size;
  const blockAt = (pos: number) => newState.doc.resolve(Math.max(0, Math.min(pos, size))).index(0);

  const additions = new Map<number, LinkedPassage[]>();
  const cleared = new Set<number>();
  for (const b of before) {
    // where did the block's text go? (inside the block: from+1 .. to-1)
    const start = mapping.map(b.from + 1, 1);
    const end = mapping.map(b.to - 1, -1);
    const same = indexById.get(b.blockId);
    if (end <= start) continue; // text deleted (or the block was empty): links stay where they are, or go
    const first = blockAt(start);
    const last = blockAt(end);
    if (first >= newState.doc.childCount) continue;
    if (same === undefined) {
      additions.set(first, mergePassages(additions.get(first) ?? [], b.passages));
    } else if (same !== first && first === last && newState.doc.child(same).textContent === "") {
      cleared.add(same);
      additions.set(first, mergePassages(additions.get(first) ?? [], b.passages));
    }
  }
  if (additions.size === 0) return null;

  const tr = newState.tr;
  newState.doc.forEach((node, offset, index) => {
    if (node.type.spec.attrs?.passages === undefined) return;
    const extra = additions.get(index);
    if (!extra && !cleared.has(index)) return;
    const own = cleared.has(index) ? [] : ((node.attrs.passages as LinkedPassage[] | null) ?? []);
    const merged = mergePassages(own, extra ?? []);
    tr.setNodeMarkup(offset, undefined, { ...node.attrs, passages: merged.length ? merged : null });
  });
  return tr.steps.length ? tr : null;
}

export function passageLinksPlugin() {
  return new Plugin({ key: passageLinksKey, appendTransaction: carryOverLinks });
}
