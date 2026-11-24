// GET  /api/v1/notes/{id}/gespreksvragen — the latest conversation questions of a note (or null).
// POST /api/v1/notes/{id}/gespreksvragen — make 5 questions for a group from a finished note (Ronde 4, D1).
// A proposal next to the note: the note itself is never changed.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { discussNote, latestDiscussion } from "@/lib/ai/data";
import { providerForUser } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  try {
    return json({ discussion: await latestDiscussion(auth.supabase, id.data) }, requestId);
  } catch (err) {
    logError(requestId, "GET /notes/:id/gespreksvragen", err as { code?: string });
    return errorResponse("INTERNAL", "De gespreksvragen konden niet worden geladen.", requestId);
  }
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  const { provider } = await providerForUser(auth.supabase);
  if (!provider) return errorResponse("FORBIDDEN", "Er is nog geen AI-aanbieder ingesteld. Er is niets verstuurd.", requestId);
  try {
    const r = await discussNote(auth.supabase, provider, id.data);
    if (r.ok) {
      console.info(JSON.stringify({ level: "info", requestId, route: "POST /notes/:id/gespreksvragen", questions: r.discussion.questions.length, reused: r.reused }));
      return json(r, requestId);
    }
    if (r.kind === "not_found") return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    if (r.kind === "not_finished") return errorResponse("INVALID_INPUT", "Gespreksvragen worden pas gemaakt nadat je de notitie hebt afgerond.", requestId);
    if (r.kind === "ai_off") return errorResponse("FORBIDDEN", "AI staat uit. Zet AI-hulp aan bij Instellingen.", requestId);
    if (r.kind === "busy") return errorResponse("RATE_LIMITED", "Deze AI-taak loopt al. Wacht even en probeer het dan opnieuw; er wordt niet dubbel betaald.", requestId);
    if (r.kind === "empty") return errorResponse("INVALID_INPUT", "Bij deze notitie kon AI geen gespreksvragen maken.", requestId);
    if (r.kind === "failed") return errorResponse("INTERNAL", "De gespreksvragen zijn drie keer mislukt. Er wordt niet opnieuw betaald; probeer het na een wijziging nog eens.", requestId);
    return errorResponse("RATE_LIMITED", "Het AI-budget van deze maand is op. Gewoon schrijven werkt gewoon door.", requestId);
  } catch (err) {
    logError(requestId, "POST /notes/:id/gespreksvragen", err as { code?: string });
    return errorResponse("INTERNAL", "De gespreksvragen zijn mislukt. Je notitie is niet veranderd.", requestId);
  }
}
