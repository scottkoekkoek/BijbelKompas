import { describe, expect, it } from "vitest";
import { filterBooks, formatReference, isBackPath, neighbours, nextSelection, parseVerseTarget, passagePath, readerPath } from "./bible";

const books = [
  { code: "GEN", name: "Genesis", chapterCount: 50 },
  { code: "EXO", name: "Exodus", chapterCount: 40 },
  { code: "1JN", name: "1 Johannes", chapterCount: 5 },
  { code: "JHN", name: "Johannes", chapterCount: 21 },
  { code: "JOL", name: "Joël", chapterCount: 3 },
];

describe("nextSelection", () => {
  it("selects, extends to a range in either direction and clears", () => {
    expect(nextSelection(null, 16)).toEqual({ from: 16, to: 16 });
    expect(nextSelection({ from: 16, to: 16 }, 18)).toEqual({ from: 16, to: 18 });
    expect(nextSelection({ from: 16, to: 16 }, 14)).toEqual({ from: 14, to: 16 });
    expect(nextSelection({ from: 16, to: 18 }, 17)).toBeNull();
    expect(nextSelection({ from: 16, to: 18 }, 20)).toEqual({ from: 20, to: 20 });
  });
});

describe("formatReference", () => {
  it("formats chapters, verses and ranges", () => {
    expect(formatReference("Johannes", 3, null)).toBe("Johannes 3");
    expect(formatReference("Johannes", 3, { from: 16, to: 16 })).toBe("Johannes 3:16");
    expect(formatReference("Johannes", 3, { from: 16, to: 18 }, "SV")).toBe("Johannes 3:16-18 (SV)");
  });
});

describe("neighbours", () => {
  it("moves within a book and across book boundaries", () => {
    expect(neighbours(books, "GEN", 1).prev).toBeNull();
    expect(neighbours(books, "GEN", 50).next).toEqual({ book: books[1], chapter: 1 });
    expect(neighbours(books, "EXO", 1).prev).toEqual({ book: books[0], chapter: 50 });
    expect(neighbours(books, "JOL", 3).next).toBeNull();
    expect(neighbours(books, "XXX", 1)).toEqual({ prev: null, next: null });
  });
});

describe("filterBooks", () => {
  it("ignores case, spaces and accents", () => {
    expect(filterBooks(books, "joh").map((b) => b.code)).toEqual(["1JN", "JHN"]);
    expect(filterBooks(books, "JOEL").map((b) => b.code)).toEqual(["JOL"]);
    expect(filterBooks(books, "1 joh").map((b) => b.code)).toEqual(["1JN"]);
    expect(filterBooks(books, "")).toHaveLength(5);
  });
});

it("builds reader paths", () => {
  expect(readerPath("JHN", 3)).toBe("/bible/JHN/3");
  expect(readerPath("JHN", 3, "SV")).toBe("/bible/JHN/3?v=SV");
});

it("passage links open the exact verse or range (audit BK-01)", () => {
  const id = "0b7c8a3e-1d2f-4c5b-9a8e-7f6d5c4b3a21";
  expect(passagePath({ book: "GEN", startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 1, translation: "SV" })).toBe("/bible/GEN/1?v=SV&vers=1#v1");
  expect(passagePath({ book: "JHN", startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, translation: "SV" }, `/notes/${id}`)).toBe(
    `/bible/JHN/3?v=SV&vers=16-18&terug=${encodeURIComponent(`/notes/${id}`)}#v16`,
  );
  expect(passagePath({ book: "JHN", startChapter: 3, startVerse: 35, endChapter: 4, endVerse: 2 })).toBe("/bible/JHN/3?vers=35-999#v35");
  expect(passagePath({ book: "PSA", startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 999, translation: "SV" })).toBe("/bible/PSA/23?v=SV");
  expect(passagePath({ book: "PSA", startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 999 }, "https://example.test")).toBe("/bible/PSA/23");
});

it("the reader only accepts a sane verse target and a note as the way back", () => {
  expect(parseVerseTarget("16-18")).toEqual({ from: 16, to: 18 });
  expect(parseVerseTarget("7")).toEqual({ from: 7, to: 7 });
  expect(parseVerseTarget("18-16")).toBeNull();
  expect(parseVerseTarget("0")).toBeNull();
  expect(parseVerseTarget("x")).toBeNull();
  expect(isBackPath("/notes/0b7c8a3e-1d2f-4c5b-9a8e-7f6d5c4b3a21")).toBe(true);
  expect(isBackPath("//evil.test/notes/x")).toBe(false);
  expect(isBackPath("/settings")).toBe(false);
});
