// POST /api/v1/notes/{id}/trash {trashed: boolean} (Ronde 3 §3): a draft to the trash, or back.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { NOTE_COLUMNS, toSummary } from "@/lib/notes/data";

export const dynamic = "force-dynamic";
const Body = z.object({ trashed: z.boolean() }).strict();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  if (!body.success) return errorResponse("INVALID_INPUT", "Ongeldige aanvraag.", requestId);
  const { data, error } = await auth.supabase
    .rpc("set_note_trashed", { p_note_id: id.data, p_trashed: body.data.trashed })
    .select(NOTE_COLUMNS)
    .single();
  if (error) {
    if (error.code === "42501") return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    if (error.code === "22023") return errorResponse("INVALID_INPUT", "Alleen een concept kan naar de prullenbak.", requestId);
    logError(requestId, "POST /notes/:id/trash", error);
    return errorResponse("INTERNAL", "Dat is niet gelukt.", requestId);
  }
  return json(toSummary(data as Parameters<typeof toSummary>[0]), requestId);
}
