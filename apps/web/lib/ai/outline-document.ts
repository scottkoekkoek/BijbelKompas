/**
 * ADR-018: turns an AI outline into the document of a NEW note. Pure (used in the browser and in
 * tests). The original note is never changed; the owner decides whether to save this at all.
 */
import type { NoteDocument } from "@bk/schemas";
import type { PMNode } from "@/lib/notes/document";

export type OutlineForDocument = {
  summary: string;
  mainThought: string;
  points: { heading: string; details: string[] }[];
  application: string;
  model: string;
};

const text = (t: string): PMNode[] => (t.trim() ? [{ type: "text", text: t.trim() }] : []);
const para = (t: string): PMNode => ({ type: "paragraph", content: text(t) });

export function outlineDocument(o: OutlineForDocument, sourceTitle: string, newId: () => string): NoteDocument {
  const blocks: PMNode[] = [];
  const add = (node: PMNode) => blocks.push({ ...node, attrs: { ...(node.attrs ?? {}), blockId: newId() } });
  const heading = (t: string) => add({ type: "heading", attrs: { level: 2 }, content: text(t) });

  if (o.mainThought.trim() && o.mainThought.trim() !== "-") {
    heading("Kerngedachte");
    add(para(o.mainThought));
  }
  heading("Samenvatting");
  add(para(o.summary));
  if (o.points.length > 0) {
    heading("Opzet");
    add({
      type: "orderedList",
      content: o.points.map((p) => ({
        type: "listItem",
        content: [
          para(p.heading),
          ...(p.details.length > 0 ? [{ type: "bulletList", content: p.details.map((d) => ({ type: "listItem", content: [para(d)] })) }] : []),
        ],
      })),
    });
  }
  if (o.application.trim()) {
    heading("Toepassing");
    add(para(o.application));
  }
  add({ type: "paragraph", content: [{ type: "text", text: `Opzet gemaakt met AI (${o.model}) uit “${sourceTitle || "Naamloze notitie"}”. Controleer en pas aan.`, marks: [{ type: "italic" }] }] });
  return { type: "doc", content: blocks as NoteDocument["content"] };
}

/** The outline as plain text, for copying. */
export function outlineText(o: OutlineForDocument): string {
  const lines = [] as string[];
  if (o.mainThought.trim() && o.mainThought.trim() !== "-") lines.push(`Kerngedachte: ${o.mainThought.trim()}`, "");
  lines.push(o.summary.trim(), "");
  o.points.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.heading}`);
    for (const d of p.details) lines.push(`   - ${d}`);
  });
  if (o.application.trim()) lines.push("", `Toepassing: ${o.application.trim()}`);
  return lines.join("\n").trim();
}
