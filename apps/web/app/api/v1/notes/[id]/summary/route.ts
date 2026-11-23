// Ronde 3 §5: the AI summary saved with its source note.
// GET    /api/v1/notes/{id}/summary                 — the saved summary (or null)
// PUT    /api/v1/notes/{id}/summary {outlineId}     — save it from an outline (replaces the old one)
// DELETE /api/v1/notes/{id}/summary                 — remove it; the note itself is never touched
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { deleteNoteSummary, getNoteSummary, saveNoteSummary } from "@/lib/ai/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ outlineId: z.uuid() }).strict();

async function start(ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return { requestId, fail: errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId) };
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return { requestId, fail: errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId) };
  return { requestId, auth, id: id.data };
}

export async function GET(_r: Request, ctx: Ctx) {
  const s = await start(ctx);
  if (s.fail) return s.fail;
  try {
    return json({ summary: await getNoteSummary(s.auth.supabase, s.id) }, s.requestId);
  } catch (err) {
    logError(s.requestId, "GET /notes/:id/summary", err as { code?: string });
    return errorResponse("INTERNAL", "De samenvatting kon niet worden geladen.", s.requestId);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const s = await start(ctx);
  if (s.fail) return s.fail;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("INVALID_INPUT", "Ongeldige aanvraag.", s.requestId);
  try {
    const saved = await saveNoteSummary(s.auth.supabase, s.id, body.data.outlineId);
    if (!saved) return errorResponse("NOT_FOUND", "Deze opzet hoort niet bij deze notitie.", s.requestId);
    return json({ summary: saved }, s.requestId);
  } catch (err) {
    logError(s.requestId, "PUT /notes/:id/summary", err as { code?: string });
    return errorResponse("INTERNAL", "Opslaan is mislukt. Een eerder bewaarde samenvatting is niet veranderd.", s.requestId);
  }
}

export async function DELETE(_r: Request, ctx: Ctx) {
  const s = await start(ctx);
  if (s.fail) return s.fail;
  try {
    return json({ deleted: await deleteNoteSummary(s.auth.supabase, s.id) }, s.requestId);
  } catch (err) {
    logError(s.requestId, "DELETE /notes/:id/summary", err as { code?: string });
    return errorResponse("INTERNAL", "Verwijderen is mislukt.", s.requestId);
  }
}
