// GET / PATCH /api/v1/questions/{id} (BK-049, BK-051). Only the owner changes the status.
import { QuestionUpdate } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { getQuestion, questionLinks, updateQuestion } from "@/lib/collections/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const Id = z.uuid();

export async function GET(_req: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
  try {
    const q = await getQuestion(auth.supabase, id.data);
    if (!q) return errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
    return json({ ...q, ...(await questionLinks(auth.supabase, id.data)) }, requestId);
  } catch (err) {
    logError(requestId, "GET /questions/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De vraag kon niet worden geladen.", requestId);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
  const body = await readBody(request, QuestionUpdate, requestId, "De vraag is niet compleet.");
  if (!body.ok) return body.response;
  try {
    const q = await updateQuestion(auth.supabase, id.data, body.data);
    return q ? json(q, requestId) : errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
  } catch (err) {
    logError(requestId, "PATCH /questions/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De vraag kon niet worden bewaard.", requestId);
  }
}

