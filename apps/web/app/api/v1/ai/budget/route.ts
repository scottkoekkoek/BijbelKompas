// GET /api/v1/ai/budget — this month's AI budget, whether AI is on and whether a provider is set (BK-044, BK-045)
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBudget } from "@/lib/ai/data";
import { configuredProvider } from "@/lib/ai/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    const p = configuredProvider();
    return json({ ...(await getBudget(auth.supabase)), provider: p ? { name: p.name, external: p.external } : null }, requestId);
  } catch (err) {
    logError(requestId, "GET /ai/budget", err as { code?: string });
    return errorResponse("INTERNAL", "Het AI-budget kon niet worden geladen.", requestId);
  }
}
