import { describe, expect, it } from "vitest";
import { parseOsis, toSql, validate, verseText } from "./statenvertaling.ts";

// Fictitious mini-OSIS in the source's shape. No real Bible text.
const XML = `<osis><osisText>
<div osisID="Gen" type="book"><chapter osisID="Gen.1">
<verse osisID="Gen.1.1"><w lemma="strong:H1">Alfa</w> <transChange type="added">een</transChange>.<note><catchWord>Alfa</catchWord> voetnoot</note></verse>
<verse osisID="Gen.1.2"><title>Kop</title>Beta &amp; twee.</verse>
</chapter><chapter osisID="Gen.2">
<verse osisID="Gen.2.1">[02:1] Delta. [02:2] Epsilon.</verse>
<verse osisID="Gen.2.2">[02:3] Zeta begin;</verse>
<verse osisID="Gen.2.3">Zeta vervolg.</verse>
</chapter></div>
<div osisID="Ps" type="book"><chapter osisID="Ps.84">
<verse osisID="Ps.84.6">[086:7] Typfout.</verse>
</chapter></div>
</osisText></osis>`;

describe("verseText", () => {
  it("drops notes, headings and markup and decodes entities", () => {
    expect(verseText('<w lemma="x">A</w> <note>weg</note><title>kop</title>B &amp; C')).toBe("A B & C");
  });
});

describe("parseOsis", () => {
  const segments = parseOsis(XML);
  const keys = segments.map((s) => `${s.bookCode}.${s.chapter}.${s.verse}`);

  it("keeps the translation's own numbering from the markers", () => {
    expect(keys).toEqual(["GEN.1.1", "GEN.1.2", "GEN.2.1", "GEN.2.2", "GEN.2.3", "PSA.84.7"]);
  });

  it("maps renumbered, shared and continued verses to their canonical verses", () => {
    const byKey = Object.fromEntries(segments.map((s) => [`${s.bookCode}.${s.chapter}.${s.verse}`, s]));
    expect(byKey["GEN.1.1"]).toMatchObject({ text: "Alfa een.", mappingType: "exact", targets: [{ chapter: 1, verse: 1 }] });
    expect(byKey["GEN.1.2"]!.text).toBe("Beta & twee.");
    // two translation verses share canonical 2:1
    expect(byKey["GEN.2.1"]).toMatchObject({ text: "Delta.", mappingType: "partial", targets: [{ chapter: 2, verse: 1 }] });
    expect(byKey["GEN.2.2"]).toMatchObject({ text: "Epsilon.", mappingType: "partial", targets: [{ chapter: 2, verse: 1 }] });
    // renumbered (canonical 2:2 = translation 2:3) and continued into canonical 2:3 without a marker
    expect(byKey["GEN.2.3"]).toMatchObject({
      text: "Zeta begin; Zeta vervolg.",
      mappingType: "partial",
      targets: [{ chapter: 2, verse: 2 }, { chapter: 2, verse: 3 }],
    });
  });

  it("applies the known marker fix", () => {
    expect(segments.at(-1)).toMatchObject({ bookCode: "PSA", chapter: 84, verse: 7, text: "Typfout." });
  });

  it("rejects unknown books and empty verses", () => {
    expect(() => parseOsis('<verse osisID="Tob.1.1">x</verse>')).toThrow(/Onbekend boek/);
    expect(() => parseOsis('<verse osisID="Gen.1.1"><note>alleen noot</note></verse>')).toThrow(/Leeg vers/);
  });
});

describe("validate", () => {
  const books = [{ bookCode: "GEN", chapterCount: 2 }];
  const gen = parseOsis(XML).filter((s) => s.bookCode === "GEN");

  it("accepts gap-free numbering", () => {
    expect(validate(gen, books, 5)).toEqual([]);
  });

  it("reports gaps, missing books and wrong canonical totals", () => {
    const gap = gen.filter((s) => !(s.chapter === 2 && s.verse === 2));
    expect(validate(gap, books)).toEqual(["GEN: 2:1 gevolgd door 2:3"]);
    expect(validate(gen, [...books, { bookCode: "EXO", chapterCount: 40 }])).toContain("EXO: ontbreekt");
    expect(validate(gen, books, 6)).toEqual(["5 canonieke verzen gedekt, verwacht 6"]);
  });
});

describe("toSql", () => {
  it("escapes quotes and never deletes", () => {
    const sql = toSql([{ bookCode: "GEN", chapter: 1, verse: 1, text: "Hij zei: 'ja'", targets: [{ chapter: 1, verse: 1 }], mappingType: "exact" }]);
    expect(sql).toContain("'Hij zei: ''ja'''");
    expect(sql).not.toMatch(/delete from|truncate|drop table/i);
    expect(sql).toContain("update public.bible_translations set enabled = true where code = 'SV'");
  });
});
