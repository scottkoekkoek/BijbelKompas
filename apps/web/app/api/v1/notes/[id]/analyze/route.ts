// POST /api/v1/notes/{id}/analyze — look for links with other notes, after finishing (BK-039, spec §13.3).
// Refused when AI is off, when no provider is set, before finishing, or when the budget is used up.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { analyseNote } from "@/lib/ai/data";
import { providerForUser } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  const { provider } = await providerForUser(auth.supabase);
  if (!provider) return errorResponse("FORBIDDEN", "Er is nog geen AI-aanbieder ingesteld. Er is niets verstuurd.", requestId);
  try {
    const r = await analyseNote(auth.supabase, provider, id.data);
    if (r.ok) {
      console.info(JSON.stringify({ level: "info", requestId, route: "POST /notes/:id/analyze", added: r.added, reused: r.reused }));
      return json(r, requestId, 202);
    }
    if (r.kind === "not_found") return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    if (r.kind === "not_finished") return errorResponse("INVALID_INPUT", "Een notitie wordt pas geanalyseerd nadat je hem hebt afgerond.", requestId);
    if (r.kind === "ai_off") return errorResponse("FORBIDDEN", "AI staat uit. Zet AI-hulp aan bij Instellingen.", requestId);
    if (r.kind === "failed") return errorResponse("INTERNAL", "De analyse is drie keer mislukt. Er wordt niet opnieuw betaald; probeer het na een wijziging nog eens.", requestId);
    return errorResponse("RATE_LIMITED", "Het AI-budget van deze maand is op. Gewoon schrijven en zoeken werkt gewoon door.", requestId);
  } catch (err) {
    logError(requestId, "POST /notes/:id/analyze", err as { code?: string });
    return errorResponse("INTERNAL", "De analyse is mislukt. Je notitie is niet veranderd.", requestId);
  }
}
