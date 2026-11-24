import { describe, expect, it } from "vitest";
import { dayLabel, planDays, planStatus } from "./plans";

const books = [
  { code: "GEN", name: "Genesis", chapterCount: 50 },
  { code: "PSA", name: "Psalmen", chapterCount: 150 },
  { code: "PRO", name: "Spreuken", chapterCount: 31 },
  { code: "MAT", name: "Mattheüs", chapterCount: 28 },
  { code: "MRK", name: "Markus", chapterCount: 16 },
  { code: "LUK", name: "Lukas", chapterCount: 24 },
  { code: "JHN", name: "Johannes", chapterCount: 21 },
  { code: "ACT", name: "Handelingen", chapterCount: 28 },
  { code: "ROM", name: "Romeinen", chapterCount: 16 },
  { code: "REV", name: "Openbaring", chapterCount: 22 },
];

describe("reading plans (C2)", () => {
  it("spreads every chapter over the days, in order, without gaps", () => {
    const days = planDays("psalmen-spreuken", books);
    expect(days).toHaveLength(30);
    const chapters = days.flat().reduce((n, s) => n + s.to - s.from + 1, 0);
    expect(chapters).toBe(181);
    expect(dayLabel(days[0]!)).toBe("Psalmen 1-7");
    expect(dayLabel(days.at(-1)!)).toMatch(/Spreuken \d+-31$/);
    expect(days.every((d) => d.length > 0)).toBe(true);
  });
  it("the New Testament plan starts at Mattheüs and ends with Openbaring", () => {
    const days = planDays("nt90", books);
    expect(days).toHaveLength(90);
    expect(days[0]![0]!.book).toBe("MAT");
    expect(days.flat().some((s) => s.book === "GEN")).toBe(false);
    expect(days.at(-1)!.at(-1)!).toMatchObject({ book: "REV", to: 22 });
  });
  it("being behind just means the next portion waits; no streak", () => {
    const days = planDays("psalmen-spreuken", books);
    expect(planStatus(days, "2026-11-01", 0, "2026-11-01")).toMatchObject({ behind: 0, next: { day: 1 } });
    expect(planStatus(days, "2026-11-01", 2, "2026-11-06")).toMatchObject({ behind: 3, next: { day: 3 } });
    expect(planStatus(days, "2026-11-01", 30, "2026-12-20")).toMatchObject({ done: true, next: null, behind: 0 });
  });
});
