import { describe, expect, it } from "vitest";
import { apiError, ERROR_STATUS, PreferencesPatch } from "./index";

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
