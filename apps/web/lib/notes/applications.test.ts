import { describe, expect, it } from "vitest";
import { applicationsFromBlocks } from "./applications";

const b = (note: string, position: number, block_type: string, plain_text: string) => ({ note_id: note, block_id: `${note}-${position}`, block_type, plain_text, position });

describe("toepassingen (B4)", () => {
  it("takes the blocks under a Toepassing heading until the next heading", () => {
    const rows = [
      b("n1", 0, "heading", "Kernpunten"),
      b("n1", 1, "paragraph", "Niet dit"),
      b("n1", 2, "heading", "Toepassing"),
      b("n1", 3, "paragraph", "Deze week Marja bellen"),
      b("n1", 4, "paragraph", "  "),
      b("n1", 5, "bulletList", "Elke ochtend Psalm 23 lezen"),
      b("n1", 6, "heading", "Gebed"),
      b("n1", 7, "paragraph", "Ook niet dit"),
      b("n2", 1, "paragraph", "Geen kop"),
      b("n3", 0, "heading", "toepassingen:"),
      b("n3", 1, "paragraph", "Vergeven"),
    ];
    expect(applicationsFromBlocks(rows).map((a) => [a.noteId, a.text])).toEqual([
      ["n1", "Deze week Marja bellen"],
      ["n1", "Elke ochtend Psalm 23 lezen"],
      ["n3", "Vergeven"],
    ]);
  });
});
