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
