import { z } from "zod";

/**
 * Rights status of a translation (spec §16, afspraak 2).
 * - public_domain: full text may be stored, shown, cached and processed.
 * - licensed: full text allowed under a written licence (flags below decide offline/AI).
 * - reference_only: no text; show reference + link to an external site.
 * - test_fixture: clearly marked fictitious test data, never shown as a real translation.
 */
export const RightsStatus = z.enum(["public_domain", "licensed", "reference_only", "test_fixture"]);
export type RightsStatus = z.infer<typeof RightsStatus>;

export const Translation = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  language: z.string(),
  rightsStatus: RightsStatus,
  offlineAllowed: z.boolean(),
  aiProcessingAllowed: z.boolean(),
  attribution: z.string().nullable(),
  externalUrlTemplate: z.string().nullable(),
});
export type Translation = z.infer<typeof Translation>;

export const Testament = z.enum(["OT", "NT"]);

export const BibleBook = z.object({
  code: z.string().regex(/^[1-3]?[A-Z]{2,3}$/),
  order: z.number().int().min(1).max(66),
  name: z.string(),
  testament: Testament,
  chapterCount: z.number().int().min(1),
});
export type BibleBook = z.infer<typeof BibleBook>;

/** Book codes as stored in bible_books (e.g. GEN, 1SA, JHN). */
export const BookCode = z.string().regex(/^[1-3]?[A-Z]{2,3}$/);
export const TranslationCode = z.string().regex(/^[A-Z0-9_]{2,20}$/);

/** One verse as shown in the reader, in the translation's own numbering. */
export const ChapterVerse = z.object({
  verse: z.number().int().min(1),
  text: z.string(),
});
export type ChapterVerse = z.infer<typeof ChapterVerse>;

/** GET /api/v1/bible/{translation}/{book}/{chapter} */
export const ChapterResponse = z.object({
  translation: z.object({ code: TranslationCode, name: z.string(), attribution: z.string().nullable() }),
  book: BibleBook,
  chapter: z.number().int().min(1),
  verses: z.array(ChapterVerse),
});
export type ChapterResponse = z.infer<typeof ChapterResponse>;

/** PUT /api/v1/me/reading-position */
export const ReadingPositionInput = z
  .object({
    translation: TranslationCode,
    book: BookCode,
    chapter: z.number().int().min(1).max(150),
    /** Ronde 4 (V7): the verse at the top of the screen; left out = the start of the chapter */
    verse: z.number().int().min(1).max(200).optional(),
  })
  .strict();
export type ReadingPositionInput = z.infer<typeof ReadingPositionInput>;
