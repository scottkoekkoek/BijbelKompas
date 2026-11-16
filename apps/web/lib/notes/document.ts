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
  for (const node of top) {
    if (node.type !== "bibleReference") continue;
    const r = refFromAttrs(node.attrs ?? {});
    if (!r) continue;
    links.push({
      block_id: String(node.attrs?.blockId),
      reference_text: r.label,
      origin: "editor",
      translation: r.translation,
      book: r.book,
      start_chapter: r.startChapter,
      start_verse: r.startVerse,
      end_chapter: r.endChapter,
      end_verse: r.endVerse,
    });
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
