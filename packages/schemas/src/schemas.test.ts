import { describe, expect, it } from "vitest";
import { apiError, ERROR_STATUS, HighlightCreate, HighlightPatch, PreferencesPatch } from "./index";

describe("PreferencesPatch", () => {
  it("accepts a valid partial update", () => {
    expect(PreferencesPatch.parse({ theme: "dark", bibleFontSize: 20 })).toEqual({
      theme: "dark",
      bibleFontSize: 20,
    });
  });

  it("rejects font sizes outside 16-24", () => {
    expect(PreferencesPatch.safeParse({ bibleFontSize: 15 }).success).toBe(false);
    expect(PreferencesPatch.safeParse({ bibleFontSize: 25 }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(PreferencesPatch.safeParse({ theme: "dark", owner_id: "x" }).success).toBe(false);
  });

  it("rejects an empty patch", () => {
    expect(PreferencesPatch.safeParse({}).success).toBe(false);
  });
});

describe("apiError", () => {
  it("builds the uniform error shape", () => {
    expect(apiError("INVALID_INPUT", "Ongeldig", "req-1")).toEqual({
      error: { code: "INVALID_INPUT", message: "Ongeldig", requestId: "req-1" },
    });
    expect(ERROR_STATUS.INVALID_INPUT).toBe(422);
  });
});

describe("highlights (BK-013)", () => {
  const passage = { translation: "TEST", book: "GEN", startChapter: 1, startVerse: 2, endChapter: 1, endVerse: 3 };
  it("accepts a passage with one of the offered colors and a short annotation", () => {
    expect(HighlightCreate.parse({ passage, label: "Genesis 1:2-3", color: "groen" })).toMatchObject({ annotation: "" });
    expect(HighlightCreate.safeParse({ passage, label: "x", color: "paars" }).success).toBe(false);
    expect(HighlightCreate.safeParse({ passage, label: "x", color: "geel", annotation: "a".repeat(501) }).success).toBe(false);
    expect(HighlightCreate.safeParse({ passage, label: "x", color: "geel", owner_id: "someone" }).success).toBe(false);
  });
  it("needs something to change", () => {
    expect(HighlightPatch.safeParse({}).success).toBe(false);
    expect(HighlightPatch.parse({ annotation: "  kort  " })).toEqual({ annotation: "kort" });
  });
});
