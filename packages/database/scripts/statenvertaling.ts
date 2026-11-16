/**
 * Statenvertaling import (Sprint 2, BK-010/BK-015, ADR-005).
 *
 * Source: OSIS file from Isidore-Guild/statenvertaling (CC0 transcription of the public-domain
 * 1888 edition). The file follows the common KJV-style versification in its osisIDs and marks
 * the Statenvertaling's own numbering as "[05:24]" where it differs. We keep:
 * - the verse text only (no footnotes, Strong's numbers or added chapter headings);
 * - the Statenvertaling's own numbering as segment_key (what readers expect);
 * - a mapping from every segment to the canonical (KJV-style) verse it sits in.
 */

export const OSIS_TO_CODE: Record<string, string> = {
  Gen: "GEN", Exod: "EXO", Lev: "LEV", Num: "NUM", Deut: "DEU", Josh: "JOS", Judg: "JDG", Ruth: "RUT",
  "1Sam": "1SA", "2Sam": "2SA", "1Kgs": "1KI", "2Kgs": "2KI", "1Chr": "1CH", "2Chr": "2CH", Ezra: "EZR",
  Neh: "NEH", Esth: "EST", Job: "JOB", Ps: "PSA", Prov: "PRO", Eccl: "ECC", Song: "SNG", Isa: "ISA",
  Jer: "JER", Lam: "LAM", Ezek: "EZK", Dan: "DAN", Hos: "HOS", Joel: "JOL", Amos: "AMO", Obad: "OBA",
  Jonah: "JON", Mic: "MIC", Nah: "NAM", Hab: "HAB", Zeph: "ZEP", Hag: "HAG", Zech: "ZEC", Mal: "MAL",
  Matt: "MAT", Mark: "MRK", Luke: "LUK", John: "JHN", Acts: "ACT", Rom: "ROM", "1Cor": "1CO", "2Cor": "2CO",
  Gal: "GAL", Eph: "EPH", Phil: "PHP", Col: "COL", "1Thess": "1TH", "2Thess": "2TH", "1Tim": "1TI",
  "2Tim": "2TI", Titus: "TIT", Phlm: "PHM", Heb: "HEB", Jas: "JAS", "1Pet": "1PE", "2Pet": "2PE",
  "1John": "1JN", "2John": "2JN", "3John": "3JN", Jude: "JUD", Rev: "REV",
};

export type Segment = {
  bookCode: string;
  chapter: number; // the translation's own numbering
  verse: number;
  text: string;
  /** Canonical (KJV-style) verses this segment sits in; more than one when it crosses a boundary. */
  targets: { chapter: number; verse: number }[];
  /** exact = one segment per canonical verse; partial = a canonical verse is shared or crossed. */
  mappingType: "exact" | "partial";
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Verse XML -> plain text: drops notes and headings, keeps the words. */
export function verseText(xml: string): string {
  return xml
    .replace(/<note\b[\s\S]*?<\/note>/g, "")
    .replace(/<title\b[\s\S]*?<\/title>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Known typos in the source's numbering markers, keyed by osisID. Each fix is checked:
 * the import fails when the source no longer contains the wrong marker.
 */
export const MARKER_FIXES: Record<string, { wrong: string; right: string }> = {
  "Ps.84.6": { wrong: "[086:7]", right: "[084:7]" },
};

const MARKER = /\[(\d{1,4}):(\d{1,3})\]/g;

/** Parses the OSIS document into segments in reading order. Throws on anything unexpected. */
export function parseOsis(xml: string): Segment[] {
  const segments: Segment[] = [];
  const verseRe = /<verse osisID="([^".]+)\.(\d+)\.(\d+)">([\s\S]*?)<\/verse>/g;
  for (const m of xml.matchAll(verseRe)) {
    const [, osisBook, c, v, inner] = m;
    const bookCode = OSIS_TO_CODE[osisBook!];
    if (!bookCode) throw new Error(`Onbekend boek in bron: ${osisBook}`);
    const canonicalChapter = Number(c);
    const canonicalVerse = Number(v);
    let text = verseText(inner!);
    const fix = MARKER_FIXES[`${osisBook}.${c}.${v}`];
    if (fix) {
      if (!text.includes(fix.wrong)) throw new Error(`Correctie voor ${osisBook}.${c}.${v} past niet meer`);
      text = text.replace(fix.wrong, fix.right);
    }

    // Split "lead [05:24] rest [05:25] more" into numbered parts.
    const parts: { chapter: number; verse: number; text: string }[] = [];
    let last = 0;
    let current = { chapter: canonicalChapter, verse: canonicalVerse };
    for (const mk of text.matchAll(MARKER)) {
      const before = text.slice(last, mk.index).trim();
      if (before) parts.push({ ...current, text: before });
      current = { chapter: Number(mk[1]), verse: Number(mk[2]) };
      last = mk.index! + mk[0].length;
    }
    const tail = text.slice(last).trim();
    if (tail) parts.push({ ...current, text: tail });
    if (parts.length === 0) throw new Error(`Leeg vers: ${osisBook}.${c}.${v}`);

    const mappingType = parts.length === 1 ? "exact" : "partial";
    for (const p of parts) {
      segments.push({ bookCode, ...p, targets: [{ chapter: canonicalChapter, verse: canonicalVerse }], mappingType });
    }
  }
  return mergeContinuations(segments);
}

/**
 * A translation verse that continues in the next canonical verse appears twice with the
 * same number; join those into one segment that maps to both canonical verses.
 */
function mergeContinuations(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const prev = out.at(-1);
    if (prev && prev.bookCode === s.bookCode && prev.chapter === s.chapter && prev.verse === s.verse) {
      prev.text = `${prev.text} ${s.text}`;
      prev.targets.push(...s.targets);
      prev.mappingType = "partial";
      continue;
    }
    out.push({ ...s, targets: [...s.targets] });
  }
  return out;
}

export type ValidationInput = { bookCode: string; chapterCount: number }[];

/** Checks the parsed text against the canon: every book present, numbering gap-free and increasing. */
export function validate(segments: Segment[], books: ValidationInput, expectedCanonicalVerses?: number): string[] {
  const errors: string[] = [];
  const byBook = new Map<string, Segment[]>();
  for (const s of segments) byBook.set(s.bookCode, [...(byBook.get(s.bookCode) ?? []), s]);

  for (const b of books) {
    const list = byBook.get(b.bookCode);
    if (!list) {
      errors.push(`${b.bookCode}: ontbreekt`);
      continue;
    }
    let prev = { chapter: 1, verse: 0 };
    for (const s of list) {
      const next =
        (s.chapter === prev.chapter && s.verse === prev.verse + 1) || (s.chapter === prev.chapter + 1 && s.verse === 1);
      if (!next) {
        errors.push(`${b.bookCode}: ${prev.chapter}:${prev.verse} gevolgd door ${s.chapter}:${s.verse}`);
        break;
      }
      if (!s.text) errors.push(`${b.bookCode} ${s.chapter}:${s.verse}: lege tekst`);
      prev = s;
    }
    if (prev.chapter !== b.chapterCount) {
      errors.push(`${b.bookCode}: ${prev.chapter} hoofdstukken, verwacht ${b.chapterCount}`);
    }
  }
  for (const code of byBook.keys()) {
    if (!books.some((b) => b.bookCode === code)) errors.push(`${code}: onbekend boek`);
  }
  if (expectedCanonicalVerses !== undefined) {
    const canonical = new Set(
      segments.flatMap((s) => s.targets.map((t) => `${s.bookCode}.${t.chapter}.${t.verse}`)),
    );
    if (canonical.size !== expectedCanonicalVerses) {
      errors.push(`${canonical.size} canonieke verzen gedekt, verwacht ${expectedCanonicalVerses}`);
    }
  }
  return errors;
}

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

/**
 * SQL that loads the segments idempotently in one transaction (run with psql -1).
 * Nothing is deleted: rows are inserted or updated in place, then the translation is enabled.
 */
export function toSql(segments: Segment[], translationCode = "SV"): string {
  const lines: string[] = [];
  lines.push("-- Generated by packages/database/scripts/import-statenvertaling.ts. Do not edit.");
  lines.push("set local statement_timeout = '10min';");
  lines.push(
    "create temp table sv_import (segment_key text, book_code text, chapter smallint, verse smallint, " +
      "display_order integer, text text, c_chapter smallint, c_verse smallint, mapping_type text) on commit drop;",
  );
  const rows: string[] = [];
  segments.forEach((s, i) => {
    const key = `${s.bookCode}.${s.chapter}.${s.verse}`;
    for (const t of s.targets) {
      rows.push(
        `(${q(key)},${q(s.bookCode)},${s.chapter},${s.verse},${i + 1},${q(s.text)},${t.chapter},${t.verse},${q(s.mappingType)})`,
      );
    }
  });
  for (let i = 0; i < rows.length; i += 500) {
    lines.push(`insert into sv_import values\n${rows.slice(i, i + 500).join(",\n")};`);
  }
  const code = q(translationCode);
  lines.push(`
do $$
declare
  t record;
  missing integer;
begin
  select * into t from public.bible_translations where code = ${code};
  if t.id is null then raise exception 'vertaling ${translationCode} bestaat niet (migratie 0005 ontbreekt?)'; end if;
  if t.rights_status <> 'public_domain' then raise exception 'vertaling ${translationCode} is niet publiek domein'; end if;
  select count(*) into missing from sv_import i
  where not exists (
    select 1 from public.bible_verses v join public.bible_books b on b.id = v.book_id
    where b.canon_id = t.canon_id and b.book_code = i.book_code
      and v.chapter_number = i.c_chapter and v.verse_number = i.c_verse);
  if missing > 0 then raise exception '% regels zonder canoniek vers', missing; end if;
end $$;

insert into public.translation_segments (translation_id, segment_key, reference_label, text, display_order)
select distinct on (i.segment_key) t.id, i.segment_key, b.name || ' ' || i.chapter || ':' || i.verse, i.text, i.display_order
from sv_import i
join public.bible_translations t on t.code = ${code}
join public.bible_books b on b.canon_id = t.canon_id and b.book_code = i.book_code
order by i.segment_key
on conflict (translation_id, segment_key) do update
  set text = excluded.text, reference_label = excluded.reference_label, display_order = excluded.display_order;

insert into public.verse_mappings (segment_id, canonical_verse_id, mapping_type)
select s.id, v.id, i.mapping_type
from sv_import i
join public.bible_translations t on t.code = ${code}
join public.translation_segments s on s.translation_id = t.id and s.segment_key = i.segment_key
join public.bible_books b on b.canon_id = t.canon_id and b.book_code = i.book_code
join public.bible_verses v on v.book_id = b.id and v.chapter_number = i.c_chapter and v.verse_number = i.c_verse
on conflict (segment_id, canonical_verse_id) do update set mapping_type = excluded.mapping_type;

update public.bible_translations set enabled = true where code = ${code};

select count(*) as segmenten from public.translation_segments s
join public.bible_translations t on t.id = s.translation_id where t.code = ${code};`);
  return lines.join("\n") + "\n";
}
