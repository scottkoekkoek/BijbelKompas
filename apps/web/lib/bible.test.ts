import { describe, expect, it } from "vitest";
import { filterBooks, formatReference, neighbours, nextSelection, readerPath } from "./bible";

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
