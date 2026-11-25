// POST /api/v1/ai/ask {question} — a question to your own notes, with checked sources (BK-042, BK-043, AT-11).
// Refused when AI is off or no provider is set (403), and when the budget is used up (429).
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { askNotes } from "@/lib/ai/data";
import { providerForUser } from "@/lib/ai/models";

export const dynamic = "force-dynamic";
const Body = z.object({ question: z.string().trim().min(2).max(500) }).strict();

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const { provider } = await providerForUser(auth.supabase);
  if (!provider) return errorResponse("FORBIDDEN", "Er is nog geen AI-aanbieder ingesteld. Er is niets verstuurd.", requestId);
  const body = await readBody(request, Body, requestId, "Stel een vraag van 2 tot 500 tekens.");
  if (!body.ok) return body.response;
  try {
    const r = await askNotes(auth.supabase, provider, body.data.question);
    if (r.ok) {
      // the question and the answer are private: only counts are logged
      console.info(JSON.stringify({ level: "info", requestId, route: "POST /ai/ask", sources: r.answer.sources.length, uncertain: r.answer.uncertain, reused: r.reused }));
      return json({ answer: r.answer, reused: r.reused }, requestId);
    }
    if (r.kind === "ai_off") return errorResponse("FORBIDDEN", "AI staat uit. Zet AI-hulp aan bij Instellingen.", requestId);
    if (r.kind === "busy") return errorResponse("RATE_LIMITED", "Deze AI-taak loopt al. Wacht even en probeer het dan opnieuw; er wordt niet dubbel betaald.", requestId);
    if (r.kind === "failed") return errorResponse("INTERNAL", "Deze vraag is drie keer mislukt. Er wordt niet opnieuw betaald.", requestId);
    return errorResponse("RATE_LIMITED", "Het AI-budget van deze maand is op. Gewoon zoeken werkt gewoon door.", requestId);
  } catch (err) {
    logError(requestId, "POST /ai/ask", err as { code?: string });
    return errorResponse("INTERNAL", "De vraag kon niet worden beantwoord. Er is niets veranderd.", requestId);
  }
}
