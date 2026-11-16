import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, deriveIndexes, emptyDocument, referenceBlock, validateDocument } from "./document";
import { findBook, parseReference } from "./reference";

const books = [
  { code: "PSA", name: "Psalmen", chapterCount: 150 },
  { code: "JHN", name: "Johannes", chapterCount: 21 },
  { code: "1JN", name: "1 Johannes", chapterCount: 5 },
  { code: "JOL", name: "Joël", chapterCount: 3 },
];
const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("parseReference", () => {
  it("understands common notations", () => {
    expect(parseReference("Joh 3:16", books)).toMatchObject({ book: { code: "JHN" }, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, label: "Johannes 3:16" });
    expect(parseReference("joh. 3:16-18", books)).toMatchObject({ endVerse: 18, label: "Johannes 3:16-18" });
    expect(parseReference("Johannes 3:16-4:2", books)).toMatchObject({ endChapter: 4, endVerse: 2, label: "Johannes 3:16-4:2" });
    expect(parseReference("1 joh 4:8", books)).toMatchObject({ book: { code: "1JN" }, label: "1 Johannes 4:8" });
    expect(parseReference("Ps 23", books)).toMatchObject({ startVerse: 1, endVerse: 999, label: "Psalmen 23" });
    expect(parseReference("Ps 23-24", books)).toMatchObject({ endChapter: 24, label: "Psalmen 23-24" });
    expect(parseReference("joel 2:28", books)).toMatchObject({ book: { code: "JOL" } });
  });

  it("explains what is wrong", () => {
    expect(parseReference("", books)).toHaveProperty("error");
    expect(parseReference("Henoch 1:1", books)).toEqual({ error: "Bijbelboek “Henoch” niet gevonden." });
    expect(parseReference("Joh 22:1", books)).toEqual({ error: "Johannes heeft 21 hoofdstukken." });
    expect(parseReference("Joh 3:18-16", books)).toEqual({ error: "Het einde van de verwijzing ligt vóór het begin." });
  });

  it("finds books by abbreviation", () => {
    expect(findBook(books, "ps")?.code).toBe("PSA");
    expect(findBook(books, "xyz")).toBeNull();
  });
});

describe("documents", () => {
  const ref = referenceBlock({
    blockId: ID2, label: "Johannes 3:16-18", translation: "SV", book: "JHN",
    startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18,
  });
  const doc = {
    type: "doc" as const,
    content: [
      { type: "paragraph", attrs: { blockId: ID1 }, content: [{ type: "text", text: "Want alzo ", marks: [{ type: "bold" }] }, { type: "text", text: "lief" }] },
      ref,
    ],
  };

  it("accepts a valid document and refuses broken ones", () => {
    expect(validateDocument(emptyDocument(ID1))).toEqual([]);
    expect(validateDocument(doc)).toEqual([]);
    expect(validateDocument({ type: "doc", content: [] })).toContain("Het document is leeg (minstens één blok nodig).");
    expect(validateDocument({ type: "doc", content: [{ type: "paragraph" }] })).toContain("Blok 1: blockId ontbreekt");
    expect(validateDocument({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: ID1 } }, { type: "paragraph", attrs: { blockId: ID1 } }] })).toContain("Blok 2: blockId komt dubbel voor");
    expect(validateDocument({ type: "doc", content: [{ type: "script", attrs: { blockId: ID1 } }] })).toContain("Blok 1: onbekend type script");
    expect(validateDocument({ type: "doc", content: [{ type: "paragraph", attrs: { blockId: ID1 }, content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }] })).toContain("Onbekende opmaak: link");
    expect(validateDocument({ type: "doc", content: [{ type: "bibleReference", attrs: { blockId: ID1, book: "JHN" } }] })).toContain("Blok 1: ongeldige Bijbelverwijzing");
  });

  it("derives blocks and passage links", () => {
    const { blocks, links } = deriveIndexes(doc, sha);
    expect(blocks.map((b) => [b.block_id, b.block_type, b.plain_text, b.position])).toEqual([
      [ID1, "paragraph", "Want alzo lief", 0],
      [ID2, "bibleReference", "Johannes 3:16-18", 1],
    ]);
    expect(links).toEqual([{ block_id: ID2, reference_text: "Johannes 3:16-18", origin: "editor", translation: "SV", book: "JHN", start_chapter: 3, start_verse: 16, end_chapter: 3, end_verse: 18 }]);
  });

  it("hashes the same content the same way regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(canonicalJson({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
});

describe("verse links on text blocks (BK-030)", () => {
  const g = (v: number) => ({ label: `Johannes 3:${v}`, translation: "SV", book: "JHN", startChapter: 3, startVerse: v, endChapter: 3, endVerse: v });
  const doc = {
    type: "doc" as const,
    content: [
      { type: "paragraph", attrs: { blockId: ID1, passages: [g(16), g(17)] }, content: [{ type: "text", text: "Liefde" }] },
      { type: "paragraph", attrs: { blockId: ID2 }, content: [{ type: "text", text: "Zonder" }] },
    ],
  };

  it("derives one link per passage on the block", () => {
    expect(validateDocument(doc)).toEqual([]);
    const { links } = deriveIndexes(doc, sha);
    expect(links).toEqual([
      expect.objectContaining({ block_id: ID1, reference_text: "Johannes 3:16", start_verse: 16 }),
      expect.objectContaining({ block_id: ID1, reference_text: "Johannes 3:17", start_verse: 17 }),
    ]);
  });

  it("refuses malformed or too many links", () => {
    const bad = (passages: unknown, type = "paragraph") =>
      validateDocument({ type: "doc", content: [{ type, attrs: { blockId: ID1, passages } }] });
    expect(bad([{ label: "x" }])).toContain("Blok 1: ongeldige koppeling");
    expect(bad("Joh 3:16")).toContain("Blok 1: ongeldige koppeling");
    expect(bad(Array.from({ length: 11 }, (_, i) => g(i + 1)))).toContain("Blok 1: hoogstens 10 koppelingen per blok");
    expect(bad([g(1)], "horizontalRule")).toContain("Blok 1: dit bloktype kan niet aan verzen gekoppeld worden");
    expect(bad(null)).toEqual([]);
  });
});
