import { describe, expect, it } from "vitest";
import { findReferences } from "./reference";
import { isSermonTime, localDate, sermonPreset, serviceTypeAt } from "./preekmodus";
import { quickNoteDocument } from "./quick";

const books = [
  { code: "JOS", name: "Jozua", chapterCount: 24 },
  { code: "DEU", name: "Deuteronomium", chapterCount: 34 },
  { code: "PSA", name: "Psalmen", chapterCount: 150 },
  { code: "JON", name: "Jona", chapterCount: 4 },
  { code: "JHN", name: "Johannes", chapterCount: 21 },
  { code: "ROM", name: "Romeinen", chapterCount: 16 },
  { code: "1JN", name: "1 Johannes", chapterCount: 5 },
  { code: "OBA", name: "Obadja", chapterCount: 1 },
];

describe("preekmodus (A1, V6)", () => {
  it("knows Sunday morning and evening in the Netherlands, also across the UTC date line", () => {
    expect(isSermonTime(new Date("2026-11-29T09:30:00Z"))).toBe(true); // 10:30 Sunday
    expect(isSermonTime(new Date("2026-11-29T12:30:00Z"))).toBe(false); // 13:30
    expect(isSermonTime(new Date("2026-11-29T17:30:00Z"))).toBe(true); // 18:30
    expect(isSermonTime(new Date("2026-11-30T09:30:00Z"))).toBe(false); // Monday
    expect(localDate(new Date("2026-11-28T23:30:00Z"))).toBe("2026-11-29");
    expect(serviceTypeAt(new Date("2026-11-29T08:30:00Z"))).toBe("Ochtenddienst");
    expect(serviceTypeAt(new Date("2026-11-29T17:30:00Z"))).toBe("Avonddienst");
    expect(serviceTypeAt(new Date("2026-11-26T18:30:00Z"))).toBe("Doordeweekse dienst");
  });
  it("starts with the church of the last sermon, never its speaker or series", () => {
    const last = { speaker: "ds. Fictief", organization: "Testgemeente", series: "Johannes", serviceType: "Avonddienst" };
    expect(sermonPreset(new Date("2026-11-29T09:30:00Z"), last)).toEqual({ speaker: null, series: null, organization: "Testgemeente", serviceType: "Ochtenddienst" });
    expect(sermonPreset(new Date("2026-11-29T09:30:00Z"), null).organization).toBeNull();
  });
});

describe("references in running text (A2)", () => {
  it("finds book chapter:verse, with ranges and abbreviations", () => {
    const f = findReferences("Tekst: Joh 15:5. Zie ook rom 8:28-30 en 1 Joh 4:8", books);
    expect(f.map((x) => x.refs.map((r) => r.label))).toEqual([["Johannes 15:5"], ["Romeinen 8:28-30"], ["1 Johannes 4:8"]]);
    expect(f[0]).toMatchObject({ text: "Joh 15:5", start: 7 });
  });
  it("gives every book for an ambiguous name, so the writer chooses", () => {
    const [jo] = findReferences("Jo 2:1", books);
    expect(jo!.refs.map((r) => r.book.code).sort()).toEqual(["JHN", "JON", "JOS"]);
  });
  it("leaves times, plain numbers and impossible verses alone", () => {
    expect(findReferences("De dienst begint om 10:30, de 9:30 dienst is weg", books)).toEqual([]);
    expect(findReferences("Ik heb 3 punten. Johannes 3 als geheel", books)).toEqual([]);
    expect(findReferences("Joh 30:1 en Jona 0:4", books)).toEqual([]);
    expect(findReferences("telefoon 06-12 34:56", books)).toEqual([]);
  });
  it("links each accepted reference to its own line in a quick note", () => {
    let n = 0;
    const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const text = "Joh 15:5 blijf in Mij\nzonder verwijzing";
    const doc = quickNoteDocument(text, null, id, (line) =>
      findReferences(line, books).map((f) => {
        const r = f.refs[0]!;
        return { translation: "SV", book: r.book.code, startChapter: r.startChapter, startVerse: r.startVerse, endChapter: r.endChapter, endVerse: r.endVerse, label: r.label };
      }),
    );
    const [a, b] = doc.content as { attrs: { passages?: { label: string }[] } }[];
    expect(a!.attrs.passages?.map((p) => p.label)).toEqual(["Johannes 15:5"]);
    expect(b!.attrs.passages).toBeUndefined();
  });
});
