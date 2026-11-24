/** Feature 2: the document of a quick note. Pure, so it is unit-tested. */
import type { NoteDocument, PassageRef } from "@bk/schemas";
import { MAX_PASSAGES_PER_BLOCK, referenceBlock, type LinkedPassage, type PMNode } from "./document";

export type QuickPassage = PassageRef & { label: string };

/**
 * A Bible reference block (when there is a passage), then one paragraph per typed line. Ronde 4 (A2):
 * `linksFor` gives the passages a line should be linked to (references the writer accepted), so the
 * link stays with its own text.
 */
export function quickNoteDocument(
  text: string,
  passage: QuickPassage | null,
  newId: () => string,
  linksFor: (line: string) => LinkedPassage[] = () => [],
): NoteDocument {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  const paragraphs: PMNode[] = lines.map((l) => {
    const links = l ? linksFor(l).slice(0, MAX_PASSAGES_PER_BLOCK) : [];
    return {
      type: "paragraph",
      attrs: { blockId: newId(), ...(links.length > 0 ? { passages: links } : {}) },
      ...(l ? { content: [{ type: "text", text: l }] } : {}),
    };
  });
  const content: PMNode[] = [];
  if (passage) content.push(referenceBlock({ ...passage, blockId: newId() }));
  content.push(...(paragraphs.length > 0 ? paragraphs : [{ type: "paragraph", attrs: { blockId: newId() } }]));
  return { type: "doc", content } as unknown as NoteDocument;
}

/** A title from the first words, so the owner does not have to think of one. */
export function quickNoteTitle(text: string, passage: QuickPassage | null, now: Date): string {
  const first = text.trim().split(/\n/)[0]?.trim() ?? "";
  if (first) return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
  const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(now);
  return passage ? `Aantekening bij ${passage.label}` : `Aantekening van ${day}`;
}
