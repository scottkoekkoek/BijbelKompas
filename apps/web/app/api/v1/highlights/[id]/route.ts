// PATCH /api/v1/highlights/{id} {color?, annotation?} — change a highlight (BK-013)
// DELETE /api/v1/highlights/{id} — remove it (through a database function: the app has no delete right, ADR-008)
import { HighlightPatch } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { isInvalidHighlight, removeHighlight, updateHighlight } from "@/lib/reader/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Markering niet gevonden.", requestId);
  const body = await readBody(request, HighlightPatch, requestId, "Ongeldige wijziging.");
  if (!body.ok) return body.response;
  try {
    if (!(await updateHighlight(auth.supabase, id.data, body.data))) return errorResponse("NOT_FOUND", "Markering niet gevonden.", requestId);
    return json({ id: id.data }, requestId);
  } catch (err) {
    if (isInvalidHighlight(err)) return errorResponse("INVALID_INPUT", "Deze wijziging kan niet.", requestId);
    logError(requestId, "PATCH /highlights/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De markering kon niet worden gewijzigd.", requestId);
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Markering niet gevonden.", requestId);
  try {
    if (!(await removeHighlight(auth.supabase, id.data))) return errorResponse("NOT_FOUND", "Markering niet gevonden.", requestId);
    return json({ removed: true }, requestId);
  } catch (err) {
    logError(requestId, "DELETE /highlights/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De markering kon niet worden verwijderd.", requestId);
  }
}
