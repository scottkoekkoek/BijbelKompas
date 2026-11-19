// Sprint 9: highlights (BK-013) and comparing translations (BK-011).
import { z } from "zod";
import { PassageRef } from "./notes";

export const HIGHLIGHT_COLORS = ["geel", "groen", "blauw", "roze"] as const;
export const HighlightColor = z.enum(HIGHLIGHT_COLORS);
export type HighlightColor = z.infer<typeof HighlightColor>;
export const HIGHLIGHT_COLOR_LABEL: Record<HighlightColor, string> = { geel: "Geel", groen: "Groen", blauw: "Blauw", roze: "Roze" };

const Annotation = z.string().trim().max(500);

export const HighlightCreate = z
  .object({ passage: PassageRef, label: z.string().trim().min(1).max(200), color: HighlightColor, annotation: Annotation.default("") })
  .strict();
export type HighlightCreate = z.infer<typeof HighlightCreate>;

export const HighlightPatch = z
  .object({ color: HighlightColor.optional(), annotation: Annotation.optional() })
  .strict()
  .refine((p) => p.color !== undefined || p.annotation !== undefined, { message: "Niets te wijzigen" });
export type HighlightPatch = z.infer<typeof HighlightPatch>;

/** A highlight as the reader shows it: the verse numbers it covers in the translation being read. */
export type ChapterHighlight = { id: string; label: string; color: HighlightColor; annotation: string; verses: number[] };

/** One row of a comparison: a verse of the first translation and the text of the second for the same verses. */
export type CompareRow = { verse: number; text: string; otherVerses: string[]; otherTexts: string[]; uncertain: boolean };
