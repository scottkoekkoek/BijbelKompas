// POST /api/v1/ai/suggestions/{id} {status} — accept, postpone or reject a suggestion (BK-041, AT-10). Notes are never changed.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { decide } from "@/lib/ai/data";

export const dynamic = "force-dynamic";
const Body = z.object({ status: z.enum(["geaccepteerd", "uitgesteld", "afgewezen", "voorgesteld"]) }).strict();

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Voorstel niet gevonden.", requestId);
  const body = await readBody(request, Body, requestId, "Ongeldige keuze.");
  if (!body.ok) return body.response;
  try {
    if (!(await decide(auth.supabase, id.data, body.data.status))) return errorResponse("NOT_FOUND", "Voorstel niet gevonden.", requestId);
    return json({ id: id.data, status: body.data.status }, requestId);
  } catch (err) {
    logError(requestId, "POST /ai/suggestions/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De keuze kon niet worden bewaard.", requestId);
  }
}
