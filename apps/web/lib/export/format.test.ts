import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { packExport } from "./build";
import { EXPORT_FORMAT, linksOf, markdownFileName, noteToMarkdown, type ExportData, type ExportNote } from "./format";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const ref = { label: "Johannes 3:16", translation: "SV", book: "JHN", startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 };

const note: ExportNote = {
  id: "33333333-3333-4333-8333-333333333333",
  title: "Preek over *liefde*",
  noteType: "preek",
  status: "afgerond",
  eventDate: "2026-11-15",
  createdAt: "2026-11-15T09:00:00.000Z",
  updatedAt: "2026-11-15T12:00:00.000Z",
  completedAt: "2026-11-15T12:00:00.000Z",
  archivedAt: null,
  documentVersion: 4,
  sermon: { speaker: "Ds. Fictief", organization: null, series: "Johannes", serviceType: "Ochtenddienst" },
  document: {
    type: "doc",
    content: [
      { type: "heading", attrs: { blockId: B1, level: 2 }, content: [{ type: "text", text: "Kern" }] },
      { type: "paragraph", attrs: { blockId: B2, passages: [ref] }, content: [{ type: "text", text: "God had de wereld ", marks: [{ type: "bold" }] }, { type: "text", text: "lief." }] },
      { type: "bulletList", attrs: { blockId: "44444444-4444-4444-8444-444444444444" }, content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "punt" }] }] }] },
    ],
  },
  passageLinks: [],
  revisions: [{ number: 1, reason: "afronden", createdAt: "2026-11-15T12:00:00.000Z", metadata: {}, contentHash: "h", document: {} }],
};

describe("export (BK-054)", () => {
  it("derives the verse links from the document", () => {
    expect(linksOf(note.document)).toEqual([{ blockId: B2, reference: "Johannes 3:16", translation: "SV", book: "JHN", start: "3:16", end: "3:16" }]);
  });

  it("writes readable Markdown with metadata, links and versions", () => {
    const md = noteToMarkdown(note);
    expect(md).toContain("# Preek over \\*liefde\\*");
    expect(md).toContain("- Soort: Preek");
    expect(md).toContain("- Spreker: Ds. Fictief");
    expect(md).toContain("## Kern");
    expect(md).toContain("**God had de wereld **lief.");
    expect(md).toContain("*Gekoppeld aan: Johannes 3:16*");
    expect(md).toContain("- punt");
    expect(md).toContain("- Versie 1: afgerond, 2026-11-15");
  });

  it("gives every note a safe, unique file name", () => {
    const used = new Set<string>();
    expect(markdownFileName(note, used)).toBe("20261115-preek-over-liefde.md");
    expect(markdownFileName(note, used)).toBe("20261115-preek-over-liefde-2.md");
    expect(markdownFileName({ ...note, title: "../../etc", eventDate: null }, used)).toBe("20261115-etc.md");
  });

  it("packs JSON and Markdown in one zip that reads back intact", () => {
    const data: ExportData = { format: EXPORT_FORMAT, version: 1, exportedAt: "2026-11-16T10:00:00.000Z", notes: [note], templates: [], preferences: null, readingPosition: null };
    const files = unzipSync(packExport(data));
    expect(Object.keys(files).sort()).toEqual(["LEESMIJ.md", "bijbelkompas.json", "notities/20261115-preek-over-liefde.md"]);
    expect(JSON.parse(strFromU8(files["bijbelkompas.json"]!))).toEqual(data);
  });
});
