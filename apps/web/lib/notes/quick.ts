/** Feature 2: the document of a quick note. Pure, so it is unit-tested. */
import type { NoteDocument, PassageRef } from "@bk/schemas";
import { referenceBlock, type PMNode } from "./document";

export type QuickPassage = PassageRef & { label: string };

/** A Bible reference block (when there is a passage), then one paragraph per typed line. */
export function quickNoteDocument(text: string, passage: QuickPassage | null, newId: () => string): NoteDocument {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trimEnd());
  while (lines.length > 0 && lines.at(-1) === "") lines.pop();
  const paragraphs: PMNode[] = lines.map((l) => ({
    type: "paragraph",
    attrs: { blockId: newId() },
    ...(l ? { content: [{ type: "text", text: l }] } : {}),
  }));
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
