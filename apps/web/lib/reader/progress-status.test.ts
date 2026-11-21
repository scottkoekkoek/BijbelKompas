import { describe, expect, it } from "vitest";
import { bookProgressText, chapterStatus } from "./progress-status";

describe("reading progress (feature 6)", () => {
  it("names the status of a chapter", () => {
    expect(chapterStatus(27, 0)).toBe("ongelezen");
    expect(chapterStatus(27, 8)).toBe("deels");
    expect(chapterStatus(27, 27)).toBe("gelezen");
  });
  it("writes the book count", () => {
    expect(bookProgressText("Johannes", 8, 21)).toBe("Johannes · 8 van 21 hoofdstukken gelezen");
    expect(bookProgressText("Obadja", 1, 1)).toBe("Obadja · 1 van 1 hoofdstuk gelezen");
  });
});
