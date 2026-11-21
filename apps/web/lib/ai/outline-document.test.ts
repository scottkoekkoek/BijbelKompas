import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateDocument } from "@/lib/notes/document";
import { outlineDocument, outlineText } from "./outline-document";

const outline = {
  summary: "Over Gods geduld in de zondvloed.",
  mainThought: "God is geduldig.",
  points: [
    { heading: "Het oordeel", details: ["Genesis 6", "Noach vond genade"] },
    { heading: "De ark", details: [] },
  ],
  application: "Vertrouw op Hem.",
  model: "fictief/lokaal-1",
};

describe("outline as a new note (ADR-018)", () => {
  it("builds a valid note document with a fresh id per block", () => {
    const doc = outlineDocument(outline, "Preek over Noach", randomUUID);
    expect(validateDocument(doc)).toEqual([]);
    const types = doc.content.map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "heading", "paragraph", "heading", "orderedList", "heading", "paragraph", "paragraph"]);
    expect(JSON.stringify(doc)).toContain("Preek over Noach");
  });

  it("leaves out empty parts", () => {
    const doc = outlineDocument({ ...outline, mainThought: "-", points: [], application: "" }, "", randomUUID);
    expect(validateDocument(doc)).toEqual([]);
    expect(doc.content.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph"]);
  });

  it("copies as plain text", () => {
    expect(outlineText(outline)).toBe(
      "Kerngedachte: God is geduldig.\n\nOver Gods geduld in de zondvloed.\n\n1. Het oordeel\n   - Genesis 6\n   - Noach vond genade\n2. De ark\n\nToepassing: Vertrouw op Hem.",
    );
  });
});
