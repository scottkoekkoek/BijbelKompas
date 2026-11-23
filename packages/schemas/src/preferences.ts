import { z } from "zod";

export const Theme = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof Theme>;

export const BIBLE_FONT_MIN = 16;
export const BIBLE_FONT_MAX = 24;

/** Full preferences row as returned by the API. */
export const Preferences = z.object({
  defaultTranslationId: z.uuid().nullable(),
  aiEnabled: z.boolean(),
  /** chosen AI model id; null = the server default. The server checks it against its allowed list. */
  aiModel: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,79}$/).nullable(),
  autoAnalysis: z.boolean(),
  theme: Theme,
  bibleFontSize: z.number().int().min(BIBLE_FONT_MIN).max(BIBLE_FONT_MAX),
  offlineRecentLimit: z.number().int().min(0).max(200),
  editorPreferences: z.record(z.string(), z.unknown()),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type Preferences = z.infer<typeof Preferences>;

/** PATCH /api/v1/me/preferences body: partial, at least one field, no unknown keys. */
export const PreferencesPatch = Preferences.omit({ updatedAt: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Geen wijzigingen opgegeven" });
export type PreferencesPatch = z.infer<typeof PreferencesPatch>;

export const DEFAULT_PREFERENCES: Omit<Preferences, "updatedAt"> = {
  defaultTranslationId: null,
  aiEnabled: false,
  aiModel: null,
  autoAnalysis: false,
  theme: "system",
  bibleFontSize: 18,
  offlineRecentLimit: 30,
  editorPreferences: {},
};
