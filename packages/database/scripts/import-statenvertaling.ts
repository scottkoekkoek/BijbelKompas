/**
 * Usage: node scripts/import-statenvertaling.ts <STV.xml> <out.sql>
 * Parses and validates the source, then writes SQL for psql. Never connects to a database itself;
 * scripts/import-statenvertaling.sh downloads the pinned source and applies the SQL.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOsis, toSql, validate } from "./statenvertaling.ts";

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error("Gebruik: node scripts/import-statenvertaling.ts <STV.xml> <out.sql>");
  process.exit(2);
}

// Chapter counts per book come from the canon migration, so source and database agree.
const here = dirname(fileURLToPath(import.meta.url));
const canonSql = readFileSync(join(here, "../supabase/migrations/20261115000002_bible_core.sql"), "utf8");
const books = [...canonSql.matchAll(/\('([1-3]?[A-Z]{2,3})', \d+, '[^']*', '(?:OT|NT)', (\d+)\)/g)].map((m) => ({
  bookCode: m[1]!,
  chapterCount: Number(m[2]),
}));
if (books.length !== 66) throw new Error(`verwacht 66 boeken in de canon-migratie, gevonden ${books.length}`);

const segments = parseOsis(readFileSync(source, "utf8"));
const errors = validate(segments, books, 31102);
if (errors.length > 0) {
  console.error(`Bron afgekeurd (${errors.length} fouten):\n- ${errors.slice(0, 50).join("\n- ")}`);
  process.exit(1);
}
writeFileSync(out, toSql(segments));
const partial = segments.filter((s) => s.mappingType === "partial").length;
console.log(
  JSON.stringify({ event: "SV_PARSED", segments: segments.length, books: books.length, partialMappings: partial }),
);
