// GET /api/v1/sync/pull?cursor=&limit= — note summaries changed since the cursor (BK-027, spec §13.2).
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { isValidCursor, pullSummaries } from "@/lib/sync/server";

export const dynamic = "force-dynamic";

const Query = z.object({
  cursor: z.string().max(200).refine(isValidCursor, "Ongeldige cursor").optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldige cursor.", requestId, z.flattenError(parsed.error));
  try {
    return json(await pullSummaries(auth.supabase, parsed.data.cursor ?? null, parsed.data.limit), requestId);
  } catch (err) {
    logError(requestId, "GET /sync/pull", err as { code?: string });
    return errorResponse("INTERNAL", "Ophalen is mislukt.", requestId);
  }
}
