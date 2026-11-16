// POST /api/v1/notes/{id}/archive {archived: boolean} (BK-024)
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { NOTE_COLUMNS, toSummary } from "@/lib/notes/data";

export const dynamic = "force-dynamic";
const Body = z.object({ archived: z.boolean() }).strict();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  if (!body.success) return errorResponse("INVALID_INPUT", "Ongeldige aanvraag.", requestId);
  const { data, error } = await auth.supabase
    .rpc("set_note_archived", { p_note_id: id.data, p_archived: body.data.archived })
    .select(NOTE_COLUMNS)
    .single();
  if (error) {
    if (error.code === "42501") return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    logError(requestId, "POST /notes/:id/archive", error);
    return errorResponse("INTERNAL", "Archiveren is mislukt.", requestId);
  }
  return json(toSummary(data as Parameters<typeof toSummary>[0]), requestId);
}
