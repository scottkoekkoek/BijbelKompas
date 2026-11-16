// POST /api/v1/notes/{id}/revisions/{n}/restore {baseVersion} (BK-023): becomes a new revision
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { restoreRevision } from "@/lib/notes/data";

export const dynamic = "force-dynamic";
const Body = z.object({ baseVersion: z.number().int().min(1) }).strict();

export async function POST(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const p = await ctx.params;
  const id = z.uuid().safeParse(p.id);
  const n = z.coerce.number().int().min(1).safeParse(p.n);
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!id.success || !n.success) return errorResponse("NOT_FOUND", "Versie niet gevonden.", requestId);
  if (!body.success) return errorResponse("INVALID_INPUT", "Ongeldige aanvraag.", requestId);
  try {
    const result = await restoreRevision(auth.supabase, id.data, n.data, body.data.baseVersion);
    if (result.ok) return json(result.note, requestId);
    if (result.kind === "conflict") {
      return errorResponse("REVISION_CONFLICT", "De notitie is intussen gewijzigd. Laad de pagina opnieuw.", requestId, {
        current: result.current,
      });
    }
    if (result.kind === "not_found") return errorResponse("NOT_FOUND", "Versie niet gevonden.", requestId);
    return errorResponse("INVALID_INPUT", result.message, requestId, result.details);
  } catch (err) {
    logError(requestId, "POST /notes/:id/revisions/:n/restore", err as { code?: string });
    return errorResponse("INTERNAL", "Terugzetten is mislukt.", requestId);
  }
}
