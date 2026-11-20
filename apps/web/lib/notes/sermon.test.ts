import { describe, expect, it } from "vitest";
import { canOpenSermonView, clampFontStep, inPassage, notePassages, passageChapters } from "./sermon";

const ref = (startVerse: number, endVerse: number, extra: Record<string, unknown> = {}) => ({
  translation: "SV", book: "JHN", startChapter: 15, startVerse, endChapter: 15, endVerse, label: `Johannes 15:${startVerse}-${endVerse}`, ...extra,
});

describe("sermon view (feature 4)", () => {
  it("collects reference blocks and linked passages once, in order", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "bibleReference", attrs: { blockId: "a", ...ref(4, 6) } },
        { type: "paragraph", attrs: { blockId: "b", passages: [ref(4, 6), ref(7, 7)] } },
        { type: "heading", attrs: { blockId: "c", level: 2, passages: [ref(9, 11)] } },
        { type: "paragraph", attrs: { blockId: "d" } },
      ],
    };
    expect(notePassages(doc).map((p) => p.label)).toEqual(["Johannes 15:4-6", "Johannes 15:7-7", "Johannes 15:9-11"]);
  });
  it("a sermon without passages has none", () => {
    expect(notePassages({ content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] })).toEqual([]);
  });
  it("knows which verses and chapters a passage covers", () => {
    const p = ref(30, 3, { startChapter: 14, endChapter: 16 });
    expect(passageChapters(p)).toEqual([14, 15, 16]);
    expect(inPassage(p, 14, 29)).toBe(false);
    expect(inPassage(p, 15, 1)).toBe(true);
    expect(inPassage(p, 16, 4)).toBe(false);
  });
  it("opens only for a finished sermon", () => {
    expect(canOpenSermonView({ noteType: "preek", status: "afgerond" })).toBe(true);
    expect(canOpenSermonView({ noteType: "preek", status: "concept" })).toBe(false);
    expect(canOpenSermonView({ noteType: "bijbelstudie", status: "afgerond" })).toBe(false);
  });
  it("keeps the font step inside the range", () => {
    expect(clampFontStep(-3)).toBe(0);
    expect(clampFontStep(99)).toBe(6);
    expect(clampFontStep(Number.NaN)).toBe(2);
  });
});
