import { describe, expect, it } from "vitest";
import { checkedSources } from "./sources";

const fragments = [
  { noteId: "n1", blockId: "b1", title: "Preek", text: "In het begin schiep God de hemel. Daarna de aarde." },
  { noteId: "n2", blockId: "b2", title: "Studie", text: "Het licht scheidt dag en nacht." },
];

describe("checked AI sources (BK-043, AT-11)", () => {
  it("keeps only literal quotes from fragments that were given", () => {
    expect(
      checkedSources(fragments, [
        { noteId: "n1", blockId: "b1", quote: "In het begin schiep God de hemel." },
        { noteId: "n1", blockId: "b1", quote: "In het begin schiep God de hemel." }, // twice
        { noteId: "n2", blockId: "b2", quote: "Het licht is goed." }, // not in the text
        { noteId: "n3", blockId: "b9", quote: "Verzonnen bron" }, // not given
        { noteId: "n2", blockId: "b1", quote: "Daarna de aarde." }, // block of another note
        { noteId: "n2", blockId: "b2", quote: "  " },
      ]),
    ).toEqual([{ noteId: "n1", blockId: "b1", quote: "In het begin schiep God de hemel." }]);
  });
});
