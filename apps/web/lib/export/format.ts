/**
 * BK-054: the export format. JSON is complete and machine-readable (it is what a re-import reads);
 * Markdown is for people. Pure functions: no data access, unit-tested.
 */
import { NOTE_TYPE_LABELS, type NoteType, type SermonDetails } from "@bk/schemas";
import { deriveIndexes, passagesOf, type PMNode } from "@/lib/notes/document";

export const EXPORT_FORMAT = "bijbelkompas-export";
export const EXPORT_VERSION = 1;

export type ExportRevision = {
  number: number;
  reason: string;
  createdAt: string;
  metadata: unknown;
  contentHash: string;
  document: unknown;
};

export type ExportNote = {
  id: string;
  title: string;
  noteType: NoteType;
  status: "concept" | "afgerond";
  eventDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  documentVersion: number;
  sermon: SermonDetails | null;
  /** the authoritative note document (TipTap/ProseMirror JSON) */
  document: { type: "doc"; content: unknown[] };
  /** derived from the document, for readers of the export that do not parse documents */
  passageLinks: { blockId: string; reference: string; translation: string; book: string; start: string; end: string }[];
  revisions: ExportRevision[];
};

export type ExportData = {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  notes: ExportNote[];
  templates: unknown[];
  preferences: unknown;
  readingPosition: unknown;
  /** Sprint 7 (added to version 1; a reader treats a missing list as empty) */
  collections?: unknown[];
  collectionItems?: unknown[];
  questions?: unknown[];
  questionNotes?: unknown[];
  questionPassages?: unknown[];
  /** Sprint 9 (BK-013) */
  highlights?: unknown[];
};

export function linksOf(doc: ExportNote["document"]): ExportNote["passageLinks"] {
  const { links } = deriveIndexes(doc as never, () => "");
  return links.map((l) => ({
    blockId: l.block_id,
    reference: l.reference_text,
    translation: l.translation,
    book: l.book,
    start: `${l.start_chapter}:${l.start_verse}`,
    end: `${l.end_chapter}:${l.end_verse}`,
  }));
}

// ------------------------------------------------------------------ Markdown

const esc = (s: string) => s.replace(/([\\`*_[\]#<>|])/g, "\\$1");

function inline(nodes: PMNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      if (n.type !== "text") return "";
      let t = esc(n.text ?? "");
      for (const m of n.marks ?? []) {
        if (m.type === "bold") t = `**${t}**`;
        else if (m.type === "italic") t = `*${t}*`;
        else if (m.type === "strike") t = `~~${t}~~`;
      }
      return t;
    })
    .join("");
}

function block(n: PMNode, indent = ""): string {
  switch (n.type) {
    case "paragraph":
      return indent + inline(n.content);
    case "heading":
      return `${n.attrs?.level === 3 ? "###" : "##"} ${inline(n.content)}`;
    case "blockquote":
      return (n.content ?? []).map((c) => block(c)).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "bulletList":
    case "orderedList":
      return (n.content ?? [])
        .map((item, i) => {
          const bullet = n.type === "bulletList" ? "-" : `${i + 1}.`;
          const [first, ...rest] = (item.content ?? []).map((c) => block(c, `${indent}   `).trimStart());
          return [`${indent}${bullet} ${first ?? ""}`, ...rest.map((r) => `${indent}   ${r}`)].join("\n");
        })
        .join("\n");
    case "horizontalRule":
      return "---";
    case "bibleReference":
      return `> **${esc(String(n.attrs?.label ?? ""))}** (${esc(String(n.attrs?.translation ?? ""))})`;
    default:
      return "";
  }
}

function sermonLines(s: SermonDetails | null): string[] {
  if (!s) return [];
  return [
    s.speaker && `- Spreker: ${esc(s.speaker)}`,
    s.organization && `- Kerk of gemeente: ${esc(s.organization)}`,
    s.series && `- Serie: ${esc(s.series)}`,
    s.serviceType && `- Dienst: ${esc(s.serviceType)}`,
  ].filter((x): x is string => Boolean(x));
}

const REASONS: Record<string, string> = { afronden: "afgerond", handmatig: "handmatig opgeslagen", pauze: "schrijfpauze", herstel: "teruggezet" };
const day = (iso: string) => iso.slice(0, 10);

export function noteToMarkdown(n: ExportNote): string {
  const out: string[] = [`# ${esc(n.title || "Naamloze notitie")}`, ""];
  out.push(
    `- Soort: ${NOTE_TYPE_LABELS[n.noteType]}`,
    `- Status: ${n.status === "afgerond" ? "Afgerond" : "Concept"}`,
    ...(n.eventDate ? [`- Datum: ${n.eventDate}`] : []),
    ...sermonLines(n.sermon),
    `- Laatst gewijzigd: ${day(n.updatedAt)}`,
    ...(n.archivedAt ? ["- In het archief"] : []),
    "",
  );
  for (const b of (n.document.content ?? []) as PMNode[]) {
    const text = block(b);
    if (text.trim()) out.push(text, "");
    const passages = passagesOf(b);
    if (passages.length) out.push(`*Gekoppeld aan: ${passages.map((p) => esc(p.label)).join("; ")}*`, "");
  }
  if (n.revisions.length) {
    out.push("## Versies", "");
    for (const r of n.revisions) out.push(`- Versie ${r.number}: ${REASONS[r.reason] ?? r.reason}, ${day(r.createdAt)}`);
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** A file name that is safe on every system and unique within the export. */
export function markdownFileName(n: ExportNote, used: Set<string>): string {
  const base =
    (n.title || "naamloos")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "naamloos";
  const prefix = (n.eventDate ?? day(n.createdAt)).replace(/-/g, "");
  let name = `${prefix}-${base}.md`;
  for (let i = 2; used.has(name); i++) name = `${prefix}-${base}-${i}.md`;
  used.add(name);
  return name;
}

export function readme(data: ExportData): string {
  return [
    "# BijbelKompas-export",
    "",
    `Gemaakt op ${data.exportedAt.slice(0, 16).replace("T", " ")} (UTC). ${data.notes.length} notities.`,
    "",
    "- `bijbelkompas.json`: alles, volledig en machineleesbaar (notities, documenten, Bijbelkoppelingen, alle versies,",
    "  collecties, onderzoeksvragen, markeringen, sjablonen en voorkeuren). Dit bestand kan later weer worden ingelezen.",
    "- `notities/`: elke notitie als leesbaar Markdown-bestand, met koppelingen en een lijst van versies.",
    "",
    "Bewaar deze export op een veilige plek: hij bevat al je persoonlijke notities.",
    "",
  ].join("\n");
}
