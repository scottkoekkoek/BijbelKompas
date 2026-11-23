// GET /api/v1/ai/budget — this month's AI budget, whether AI is on and whether a provider is set (BK-044, BK-045)
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBudget } from "@/lib/ai/data";
import { providerForUser } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    const { provider: p, fellBack } = await providerForUser(auth.supabase);
    return json({ ...(await getBudget(auth.supabase)), provider: p ? { name: p.name, external: p.external, model: p.model, fellBack } : null }, requestId);
  } catch (err) {
    logError(requestId, "GET /ai/budget", err as { code?: string });
    return errorResponse("INTERNAL", "Het AI-budget kon niet worden geladen.", requestId);
  }
}
