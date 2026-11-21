// POST /api/v1/ai/explain {translation, book, chapter, from, to} — AI-uitleg bij geselecteerde verzen (ADR-017).
// Only for a translation that may be processed by AI (never HSV/NBV21). Refused when AI is off or no
// provider is set (403), and when the budget is used up (429).
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { explainVerses, MAX_EXPLAIN_VERSES } from "@/lib/ai/data";
import { configuredProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";
const Body = z
  .object({
    translation: z.string().regex(/^[A-Z0-9_]{2,20}$/),
    book: z.string().regex(/^[1-3]?[A-Z]{2,3}$/),
    chapter: z.number().int().min(1).max(150),
    from: z.number().int().min(1).max(999),
    to: z.number().int().min(1).max(999),
  })
  .strict()
  .refine((b) => b.from <= b.to);

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const provider = configuredProvider();
  if (!provider) return errorResponse("FORBIDDEN", "Er is nog geen AI-aanbieder ingesteld. Er is niets verstuurd.", requestId);
  const body = await readBody(request, Body, requestId, "Ongeldige verzen.");
  if (!body.ok) return body.response;
  try {
    const r = await explainVerses(auth.supabase, provider, body.data);
    if (r.ok) {
      console.info(JSON.stringify({ level: "info", requestId, route: "POST /ai/explain", verses: body.data.to - body.data.from + 1, reused: r.reused }));
      return json({ explanation: r.explanation, reused: r.reused }, requestId);
    }
    if (r.kind === "ai_off") return errorResponse("FORBIDDEN", "AI staat uit. Zet AI-hulp aan bij Instellingen.", requestId);
    if (r.kind === "not_allowed") return errorResponse("FORBIDDEN", "Deze vertaling mag niet naar AI. Kies de Statenvertaling.", requestId);
    if (r.kind === "not_found") return errorResponse("NOT_FOUND", "Deze verzen zijn niet gevonden.", requestId);
    if (r.kind === "too_long") return errorResponse("INVALID_INPUT", `Kies hoogstens ${MAX_EXPLAIN_VERSES} verzen.`, requestId);
    if (r.kind === "failed") return errorResponse("INTERNAL", "Deze uitleg is drie keer mislukt. Er wordt niet opnieuw betaald.", requestId);
    return errorResponse("RATE_LIMITED", "Het AI-budget van deze maand is op. Lezen werkt gewoon door.", requestId);
  } catch (err) {
    logError(requestId, "POST /ai/explain", err as { code?: string });
    return errorResponse("INTERNAL", "De uitleg is niet gelukt. Probeer het later opnieuw.", requestId);
  }
}
