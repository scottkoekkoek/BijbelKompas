// GET /api/v1/templates (own + built-in) and POST /api/v1/templates (BK-020)
import { TemplateInput } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { createTemplate, listTemplates } from "@/lib/notes/data";
import { BUILTIN_TEMPLATES } from "@/lib/notes/templates";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    return json({ templates: [...(await listTemplates(auth.supabase)), ...BUILTIN_TEMPLATES] }, requestId);
  } catch (err) {
    logError(requestId, "GET /templates", err as { code?: string });
    return errorResponse("INTERNAL", "Sjablonen konden niet worden geladen.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = TemplateInput.safeParse(raw);
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Het sjabloon is niet compleet.", requestId, z.flattenError(parsed.error));
  try {
    return json(await createTemplate(auth.supabase, parsed.data), requestId, 201);
  } catch (err) {
    logError(requestId, "POST /templates", err as { code?: string });
    return errorResponse("INTERNAL", "Het sjabloon kon niet worden bewaard.", requestId);
  }
}
