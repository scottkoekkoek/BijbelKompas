/**
 * Feature 4 (preekweergave): the Bible passages of a note, in the order they appear: reference
 * blocks first where they stand, then the passages linked to text blocks. Each passage once.
 * Pure: no data access.
 */
import { passagesOf, refFromAttrs, samePassage, type LinkedPassage, type PMNode } from "./document";

export function notePassages(doc: { content?: unknown[] }, max = 20): LinkedPassage[] {
  const out: LinkedPassage[] = [];
  const add = (p: LinkedPassage | null) => {
    if (p && out.length < max && !out.some((q) => samePassage(p, q))) out.push(p);
  };
  for (const node of (doc.content ?? []) as PMNode[]) {
    if (node.type === "bibleReference") add(refFromAttrs(node.attrs ?? {}));
    else passagesOf(node).forEach(add);
  }
  return out;
}

/** The chapters a passage covers (a long range is cut off after `max` chapters). */
export function passageChapters(p: LinkedPassage, max = 3): number[] {
  const last = Math.min(p.endChapter, p.startChapter + max - 1);
  return Array.from({ length: last - p.startChapter + 1 }, (_, i) => p.startChapter + i);
}

/** Whether a verse of a chapter lies inside the passage. */
export function inPassage(p: LinkedPassage, chapter: number, verse: number): boolean {
  if (chapter < p.startChapter || chapter > p.endChapter) return false;
  if (chapter === p.startChapter && verse < p.startVerse) return false;
  if (chapter === p.endChapter && verse > p.endVerse) return false;
  return true;
}

/** A sermon is shown in the reading view only once it is finished. */
export const canOpenSermonView = (n: { noteType: string; status: string }) => n.noteType === "preek" && n.status === "afgerond";

export const FONT_STEPS = [1, 1.125, 1.25, 1.375, 1.5, 1.75, 2] as const;
export const DEFAULT_FONT_STEP = 2;
export const clampFontStep = (n: number) => Math.min(FONT_STEPS.length - 1, Math.max(0, Math.round(Number.isFinite(n) ? n : DEFAULT_FONT_STEP)));
