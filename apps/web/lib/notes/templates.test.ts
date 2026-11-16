import { TemplateInput } from "@bk/schemas";
import { describe, expect, it } from "vitest";
import { validateDocument } from "./document";
import { BUILTIN_TEMPLATES, buildDocument } from "./templates";

const books = [{ code: "PSA", name: "Psalmen", chapterCount: 150 }];
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("buildDocument", () => {
  it("turns every part into valid blocks with unique ids", () => {
    const doc = buildDocument(
      [
        { kind: "kop", text: "Inleiding" },
        { kind: "alinea", text: "" },
        { kind: "citaat", text: "Een citaat" },
        { kind: "bijbelverwijzing", text: "Ps 23" },
        { kind: "bijbelverwijzing", text: "" },
        { kind: "gebed", text: "" },
      ],
      { newId, books, translation: "SV" },
    );
    expect(validateDocument(doc)).toEqual([]);
    const types = doc.content.map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "paragraph", "blockquote", "bibleReference", "heading", "paragraph", "heading", "paragraph"]);
    expect(doc.content[4]).toMatchObject({ attrs: { label: "Psalmen 23", book: "PSA", translation: "SV" } });
    expect(JSON.stringify(doc.content[5])).toContain("Bijbelgedeelte");
    expect(JSON.stringify(doc.content[7])).toContain("Gebed");
  });

  it("built-in templates are valid template input and build valid documents", () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(TemplateInput.safeParse({ name: t.name, noteType: t.noteType, description: t.description, parts: t.parts }).success).toBe(true);
      expect(validateDocument(buildDocument(t.parts, { newId, books, translation: "SV" }))).toEqual([]);
    }
  });
});
