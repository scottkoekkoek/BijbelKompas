// GET / PATCH /api/v1/templates/{id} (BK-020). Templates are archived, never deleted.
import { TemplateUpdate } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getTemplate, updateTemplate } from "@/lib/notes/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const Id = z.uuid();

export async function GET(_req: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const raw = (await ctx.params).id;
  try {
    const t = raw.startsWith("ingebouwd:") || Id.safeParse(raw).success ? await getTemplate(auth.supabase, raw) : null;
    return t ? json(t, requestId) : errorResponse("NOT_FOUND", "Sjabloon niet gevonden.", requestId);
  } catch (err) {
    logError(requestId, "GET /templates/:id", err as { code?: string });
    return errorResponse("INTERNAL", "Het sjabloon kon niet worden geladen.", requestId);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Sjabloon niet gevonden.", requestId);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = TemplateUpdate.safeParse(raw);
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Het sjabloon is niet compleet.", requestId, z.flattenError(parsed.error));
  try {
    const t = await updateTemplate(auth.supabase, id.data, parsed.data);
    return t ? json(t, requestId) : errorResponse("NOT_FOUND", "Sjabloon niet gevonden.", requestId);
  } catch (err) {
    logError(requestId, "PATCH /templates/:id", err as { code?: string });
    return errorResponse("INTERNAL", "Het sjabloon kon niet worden bewaard.", requestId);
  }
}
