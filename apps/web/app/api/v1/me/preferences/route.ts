// PATCH /api/v1/me/preferences (BK-005)
import { PreferencesPatch } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { fromRow, PREFERENCE_COLUMNS, toRowUpdate, type PreferencesRow } from "@/lib/preferences";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const { supabase, user } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = PreferencesPatch.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", "Ongeldige voorkeuren.", requestId, z.flattenError(parsed.error));
  }

  if (parsed.data.autoAnalysis === true && parsed.data.aiEnabled !== true) {
    const current = await supabase.from("user_preferences").select("ai_enabled").eq("user_id", user.id).single();
    if (!current.data?.ai_enabled) {
      return errorResponse("INVALID_INPUT", "Automatische analyse kan alleen als AI aan staat.", requestId);
    }
  }

  const { data, error } = await supabase
    .from("user_preferences")
    .update(toRowUpdate(parsed.data))
    .eq("user_id", user.id)
    .select(PREFERENCE_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23503 = unknown translation, 23514 = check constraint
    if (error.code === "23503" || error.code === "23514") {
      return errorResponse("INVALID_INPUT", "Deze waarde is niet toegestaan.", requestId);
    }
    logError(requestId, "PATCH /me/preferences", error);
    return errorResponse("INTERNAL", "Opslaan is mislukt.", requestId);
  }
  if (!data) return errorResponse("NOT_FOUND", "Voorkeuren niet gevonden.", requestId);
  return json(fromRow(data as PreferencesRow), requestId);
}
