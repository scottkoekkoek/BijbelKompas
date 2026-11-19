// GET /api/v1/ai/suggestions?note={id} — AI suggestions involving a note (BK-040)
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { suggestionsForNote } from "@/lib/ai/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const note = z.uuid().safeParse(new URL(request.url).searchParams.get("note"));
  if (!note.success) return errorResponse("INVALID_INPUT", "Ongeldige notitie.", requestId);
  try {
    return json({ suggestions: await suggestionsForNote(auth.supabase, note.data) }, requestId);
  } catch (err) {
    logError(requestId, "GET /ai/suggestions", err as { code?: string });
    return errorResponse("INTERNAL", "De voorstellen konden niet worden geladen.", requestId);
  }
}
