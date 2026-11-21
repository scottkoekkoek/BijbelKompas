import { describe, expect, it } from "vitest";
import { quickNoteDocument, quickNoteTitle } from "./quick";

let n = 0;
const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const passage = { translation: "SV", book: "JHN", startChapter: 15, startVerse: 4, endChapter: 15, endVerse: 6, label: "Johannes 15:4-6" };

describe("quick note (feature 2)", () => {
  it("starts with the passage, then one paragraph per line", () => {
    const doc = quickNoteDocument("Blijf in Mij.\n\nVrucht dragen\n\n", passage, id);
    expect(doc.content.map((b) => (b as { type: string }).type)).toEqual(["bibleReference", "paragraph", "paragraph", "paragraph"]);
    expect((doc.content[0] as { attrs: { label: string } }).attrs.label).toBe("Johannes 15:4-6");
    expect(JSON.stringify(doc.content[1])).toContain("Blijf in Mij.");
  });
  it("works without a passage", () => {
    const doc = quickNoteDocument("Alleen tekst", null, id);
    expect(doc.content).toHaveLength(1);
  });
  it("makes a title from the first line", () => {
    expect(quickNoteTitle("Blijf in Mij.\nmeer", passage, new Date())).toBe("Blijf in Mij.");
    expect(quickNoteTitle("x".repeat(80), null, new Date())).toHaveLength(58);
    expect(quickNoteTitle("", passage, new Date())).toBe("Aantekening bij Johannes 15:4-6");
  });
});
