// GET /api/v1/notes/{id}/revisions/{n} (BK-022)
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getRevision } from "@/lib/notes/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const p = await ctx.params;
  const id = z.uuid().safeParse(p.id);
  const n = z.coerce.number().int().min(1).safeParse(p.n);
  if (!id.success || !n.success) return errorResponse("NOT_FOUND", "Versie niet gevonden.", requestId);
  try {
    const rev = await getRevision(auth.supabase, id.data, n.data);
    return rev ? json(rev, requestId) : errorResponse("NOT_FOUND", "Versie niet gevonden.", requestId);
  } catch (err) {
    logError(requestId, "GET /notes/:id/revisions/:n", err as { code?: string });
    return errorResponse("INTERNAL", "De versie kon niet worden geladen.", requestId);
  }
}
