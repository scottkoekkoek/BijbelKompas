import type { Preferences, PreferencesPatch } from "@bk/schemas";

/** Row shape of public.user_preferences. */
export type PreferencesRow = {
  default_translation_id: string | null;
  ai_enabled: boolean;
  ai_model: string | null;
  auto_analysis: boolean;
  theme: Preferences["theme"];
  bible_font_size: number;
  offline_recent_limit: number;
  editor_preferences: Record<string, unknown>;
  updated_at: string;
};

export const PREFERENCE_COLUMNS =
  "default_translation_id, ai_enabled, ai_model, auto_analysis, theme, bible_font_size, offline_recent_limit, editor_preferences, updated_at";

export function fromRow(row: PreferencesRow): Preferences {
  return {
    defaultTranslationId: row.default_translation_id,
    aiEnabled: row.ai_enabled,
    aiModel: row.ai_model ?? null,
    autoAnalysis: row.auto_analysis,
    theme: row.theme,
    bibleFontSize: row.bible_font_size,
    offlineRecentLimit: row.offline_recent_limit,
    editorPreferences: row.editor_preferences,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const COLUMN: Record<keyof PreferencesPatch, keyof PreferencesRow> = {
  defaultTranslationId: "default_translation_id",
  aiEnabled: "ai_enabled",
  aiModel: "ai_model",
  autoAnalysis: "auto_analysis",
  theme: "theme",
  bibleFontSize: "bible_font_size",
  offlineRecentLimit: "offline_recent_limit",
  editorPreferences: "editor_preferences",
};

/**
 * Converts a validated patch to column updates. Turning AI off also turns
 * automatic analysis off, so the database constraint is never hit by accident.
 */
export function toRowUpdate(patch: PreferencesPatch): Partial<PreferencesRow> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    out[COLUMN[key as keyof PreferencesPatch]] = value;
  }
  if (patch.aiEnabled === false) out.auto_analysis = false;
  return out as Partial<PreferencesRow>;
}
