/**
 * Note documents (TipTap/ProseMirror JSON). The document is authoritative; blocks and
 * passage links are derived here and stored as indexes (CLAUDE.md). Pure: no data access.
 */
import type { NoteDocument, PassageRef } from "@bk/schemas";

export type PMNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "horizontalRule",
  "bibleReference",
]);
const INLINE_TYPES = new Set(["text", "hardBreak"]);
const NESTED_TYPES = new Set(["listItem", "paragraph", "bulletList", "orderedList", "blockquote", "heading"]);
const MARKS = new Set(["bold", "italic", "strike", "underline"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type BibleReferenceAttrs = PassageRef & { blockId: string; label: string };

/**
 * BK-030: a text block can be linked to Bible passages. The links live in the block's own attrs
 * (`passages`), so they stay with that block when other blocks change (AT-02).
 */
export type LinkedPassage = PassageRef & { label: string };
export const LINKABLE_TYPES = new Set(["paragraph", "heading", "bulletList", "orderedList", "blockquote"]);
export const MAX_PASSAGES_PER_BLOCK = 10;

/** The valid passages of a block (anything malformed is left out). */
export function passagesOf(node: PMNode): LinkedPassage[] {
  const raw = node.attrs?.passages;
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => (p && typeof p === "object" ? refFromAttrs(p as Record<string, unknown>) : null)).filter((p): p is LinkedPassage => p !== null);
}

export const samePassage = (a: LinkedPassage, b: LinkedPassage) =>
  a.translation === b.translation && a.book === b.book && a.startChapter === b.startChapter &&
  a.startVerse === b.startVerse && a.endChapter === b.endChapter && a.endVerse === b.endVerse;

export function emptyDocument(blockId: string): NoteDocument {
  return { type: "doc", content: [{ type: "paragraph", attrs: { blockId } }] };
}

export function referenceBlock(attrs: BibleReferenceAttrs): PMNode {
  return { type: "bibleReference", attrs: { ...attrs } };
}

/** Checks structure, node/mark types and unique block ids. Returns problems in Dutch. */
export function validateDocument(doc: NoteDocument): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const top = (doc.content ?? []) as PMNode[];
  if (top.length === 0) errors.push("Het document is leeg (minstens één blok nodig).");

  const walk = (node: PMNode, depth: number) => {
    if (depth > 12) {
      errors.push("Het document is te diep genest.");
      return;
    }
    if (node.type === "text") {
      if (typeof node.text !== "string") errors.push("Tekstknoop zonder tekst.");
      for (const m of node.marks ?? []) if (!MARKS.has(m.type)) errors.push(`Onbekende opmaak: ${m.type}`);
      return;
    }
    if (!INLINE_TYPES.has(node.type) && !NESTED_TYPES.has(node.type) && !BLOCK_TYPES.has(node.type)) {
      errors.push(`Onbekend bloktype: ${node.type}`);
      return;
    }
    for (const child of node.content ?? []) walk(child, depth + 1);
  };

  top.forEach((node, i) => {
    if (!BLOCK_TYPES.has(node.type)) errors.push(`Blok ${i + 1}: onbekend type ${node.type}`);
    const id = node.attrs?.blockId;
    if (typeof id !== "string" || !UUID.test(id)) errors.push(`Blok ${i + 1}: blockId ontbreekt`);
    else if (seen.has(id)) errors.push(`Blok ${i + 1}: blockId komt dubbel voor`);
    else seen.add(id);
    if (node.type === "bibleReference") {
      const r = refFromAttrs(node.attrs ?? {});
      if (!r) errors.push(`Blok ${i + 1}: ongeldige Bijbelverwijzing`);
    }
    const raw = node.attrs?.passages;
    if (raw !== undefined && raw !== null) {
      if (!LINKABLE_TYPES.has(node.type)) errors.push(`Blok ${i + 1}: dit bloktype kan niet aan verzen gekoppeld worden`);
      else if (!Array.isArray(raw)) errors.push(`Blok ${i + 1}: ongeldige koppeling`);
      else if (raw.length > MAX_PASSAGES_PER_BLOCK) errors.push(`Blok ${i + 1}: hoogstens ${MAX_PASSAGES_PER_BLOCK} koppelingen per blok`);
      else if (passagesOf(node).length !== raw.length) errors.push(`Blok ${i + 1}: ongeldige koppeling`);
    }
    walk(node, 0);
  });
  return errors;
}

export function plainText(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "bibleReference") return String(node.attrs?.label ?? "");
  const parts = (node.content ?? []).map(plainText);
  return node.type === "doc" || node.type === "bulletList" || node.type === "orderedList" || node.type === "blockquote"
    ? parts.join("\n")
    : parts.join("");
}

function refFromAttrs(a: Record<string, unknown>): (PassageRef & { label: string }) | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const r = {
    translation: a.translation,
    book: a.book,
    startChapter: n(a.startChapter),
    startVerse: n(a.startVerse),
    endChapter: n(a.endChapter),
    endVerse: n(a.endVerse),
    label: a.label,
  };
  if (
    typeof r.translation !== "string" ||
    !/^[A-Z0-9_]{2,20}$/.test(r.translation) ||
    typeof r.book !== "string" ||
    !/^[1-3]?[A-Z]{2,3}$/.test(r.book) ||
    typeof r.label !== "string" ||
    !r.label ||
    r.label.length > 200 ||
    !r.startChapter ||
    !r.startVerse ||
    !r.endChapter ||
    !r.endVerse
  )
    return null;
  if (r.endChapter < r.startChapter || (r.endChapter === r.startChapter && r.endVerse < r.startVerse)) return null;
  return r as PassageRef & { label: string };
}

export type DerivedBlock = { block_id: string; block_type: string; plain_text: string; position: number; content_hash: string };
export type DerivedLink = {
  block_id: string;
  reference_text: string;
  origin: "editor";
  translation: string;
  book: string;
  start_chapter: number;
  start_verse: number;
  end_chapter: number;
  end_verse: number;
};

/** Blocks and passage links derived from the document (input for save_note). */
export function deriveIndexes(doc: NoteDocument, hash: (s: string) => string) {
  const top = (doc.content ?? []) as PMNode[];
  const blocks: DerivedBlock[] = top.map((node, position) => ({
    block_id: String(node.attrs?.blockId),
    block_type: node.type,
    plain_text: plainText(node).slice(0, 20000),
    position,
    content_hash: hash(JSON.stringify(node)),
  }));
  const links: DerivedLink[] = [];
  const add = (blockId: string, r: LinkedPassage) =>
    links.push({
      block_id: blockId,
      reference_text: r.label,
      origin: "editor",
      translation: r.translation,
      book: r.book,
      start_chapter: r.startChapter,
      start_verse: r.startVerse,
      end_chapter: r.endChapter,
      end_verse: r.endVerse,
    });
  for (const node of top) {
    const blockId = String(node.attrs?.blockId);
    if (node.type === "bibleReference") {
      const r = refFromAttrs(node.attrs ?? {});
      if (r) add(blockId, r);
    } else if (LINKABLE_TYPES.has(node.type)) {
      // several passages on one block become several ranges of that block's link
      for (const r of passagesOf(node)) add(blockId, r);
    }
  }
  return { blocks, links };
}

/** Stable serialisation so the same content always gives the same hash. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
