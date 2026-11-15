// GET /api/v1/me — profile + preferences (BK-005)
import type { Me } from "@bk/schemas";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { fromRow, PREFERENCE_COLUMNS, type PreferencesRow } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const { supabase, user } = auth;

  const [profile, prefs] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_preferences").select(PREFERENCE_COLUMNS).eq("user_id", user.id).maybeSingle(),
  ]);
  if (profile.error || prefs.error) {
    logError(requestId, "GET /me", profile.error ?? prefs.error);
    return errorResponse("INTERNAL", "Gegevens konden niet worden geladen.", requestId);
  }
  if (!profile.data || !prefs.data) return errorResponse("NOT_FOUND", "Profiel niet gevonden.", requestId);

  const body: Me = {
    userId: user.id,
    email: user.email ?? null,
    displayName: profile.data.display_name,
    preferences: fromRow(prefs.data as PreferencesRow),
  };
  return json(body, requestId);
}
