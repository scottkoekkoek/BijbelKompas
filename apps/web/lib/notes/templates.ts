/** BK-020: turning a template into the starting document of a new note. Pure (used on the server and in tests). */
import type { NoteDocument, NoteTemplate, TemplatePart } from "@bk/schemas";
import { referenceBlock, type PMNode } from "./document";
import { parseReference, type BookInfo } from "./reference";

/** Built-in examples. They are not stored; "Kopiëren" makes an own, editable template from them. */
export const BUILTIN_TEMPLATES: NoteTemplate[] = [
  {
    id: "ingebouwd:preek",
    builtIn: true,
    version: 1,
    archived: false,
    name: "Preek",
    noteType: "preek",
    description: "Voor aantekeningen tijdens een preek.",
    parts: [
      { kind: "bijbelverwijzing", text: "" },
      { kind: "kop", text: "Hoofdgedachte" },
      { kind: "kop", text: "Punten" },
      { kind: "citaat", text: "" },
      { kind: "toepassing", text: "" },
      { kind: "vraag", text: "Wat neem ik mee?" },
      { kind: "gebed", text: "" },
    ],
  },
  {
    id: "ingebouwd:bijbelstudie",
    builtIn: true,
    version: 1,
    archived: false,
    name: "Bijbelstudie",
    noteType: "bijbelstudie",
    description: "Lezen, opmerken, uitleggen en toepassen.",
    parts: [
      { kind: "bijbelverwijzing", text: "" },
      { kind: "kop", text: "Wat staat er?" },
      { kind: "kop", text: "Wat betekent het?" },
      { kind: "vraag", text: "Wat roept vragen op?" },
      { kind: "toepassing", text: "" },
      { kind: "gebed", text: "" },
    ],
  },
];

export const findBuiltin = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id) ?? null;

const DEFAULT_HEADING: Record<TemplatePart["kind"], string> = {
  kop: "Kop",
  alinea: "",
  citaat: "",
  bijbelverwijzing: "Bijbelgedeelte",
  vraag: "Vraag",
  toepassing: "Toepassing",
  gebed: "Gebed",
};

const text = (t: string): PMNode[] => (t ? [{ type: "text", text: t }] : []);

/**
 * Builds the document. Every block gets a fresh id from newId. A "bijbelverwijzing" whose text is a
 * valid reference ("Ps 23") becomes a real reference block; otherwise a heading the writer fills in.
 */
export function buildDocument(
  parts: TemplatePart[],
  opts: { newId: () => string; books: BookInfo[]; translation: string },
): NoteDocument {
  const blocks: PMNode[] = [];
  const add = (node: PMNode) => blocks.push({ ...node, attrs: { ...(node.attrs ?? {}), blockId: opts.newId() } });
  const heading = (level: 2 | 3, t: string) => add({ type: "heading", attrs: { level }, content: text(t) });
  const paragraph = (t = "") => add({ type: "paragraph", content: text(t) });

  for (const part of parts) {
    const t = part.text.trim();
    switch (part.kind) {
      case "kop":
        heading(2, t || DEFAULT_HEADING.kop);
        paragraph();
        break;
      case "alinea":
        paragraph(t);
        break;
      case "citaat":
        add({ type: "blockquote", content: [{ type: "paragraph", content: text(t) }] });
        break;
      case "bijbelverwijzing": {
        const ref = t ? parseReference(t, opts.books) : null;
        if (ref && !("error" in ref)) {
          blocks.push(
            referenceBlock({
              blockId: opts.newId(),
              label: ref.label,
              translation: opts.translation,
              book: ref.book.code,
              startChapter: ref.startChapter,
              startVerse: ref.startVerse,
              endChapter: ref.endChapter,
              endVerse: ref.endVerse,
            }),
          );
        } else {
          heading(3, t || DEFAULT_HEADING.bijbelverwijzing);
          paragraph();
        }
        break;
      }
      default:
        heading(3, t || DEFAULT_HEADING[part.kind]);
        paragraph();
    }
  }
  if (blocks.length === 0) paragraph();
  return { type: "doc", content: blocks as unknown as Record<string, unknown>[] };
}
