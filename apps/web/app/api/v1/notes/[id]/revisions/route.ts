// GET /api/v1/notes/{id}/revisions (BK-022)
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { listRevisions } from "@/lib/notes/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  try {
    return json({ revisions: await listRevisions(auth.supabase, id.data) }, requestId);
  } catch (err) {
    logError(requestId, "GET /notes/:id/revisions", err as { code?: string });
    return errorResponse("INTERNAL", "Versies konden niet worden geladen.", requestId);
  }
}
