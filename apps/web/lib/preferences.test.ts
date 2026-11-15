import { describe, expect, it } from "vitest";
import { fromRow, toRowUpdate } from "./preferences";
import { safeNext, isPublicPath } from "./routes";

describe("preferences mapping", () => {
  it("maps a database row to the API shape", () => {
    expect(
      fromRow({
        default_translation_id: null,
        ai_enabled: false,
        auto_analysis: false,
        theme: "system",
        bible_font_size: 18,
        offline_recent_limit: 30,
        editor_preferences: {},
        updated_at: "2026-11-15T10:30:00+00:00",
      }),
    ).toEqual({
      defaultTranslationId: null,
      aiEnabled: false,
      autoAnalysis: false,
      theme: "system",
      bibleFontSize: 18,
      offlineRecentLimit: 30,
      editorPreferences: {},
      updatedAt: "2026-11-15T10:30:00.000Z",
    });
  });

  it("maps a patch to columns", () => {
    expect(toRowUpdate({ theme: "dark", bibleFontSize: 20 })).toEqual({ theme: "dark", bible_font_size: 20 });
  });

  it("switches automatic analysis off together with AI", () => {
    expect(toRowUpdate({ aiEnabled: false })).toEqual({ ai_enabled: false, auto_analysis: false });
  });
});

describe("routes", () => {
  it("only accepts same-site relative redirects", () => {
    expect(safeNext("/settings")).toBe("/settings");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });

  it("knows which pages are public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
