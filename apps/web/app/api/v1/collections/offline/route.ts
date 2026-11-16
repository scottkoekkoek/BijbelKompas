// GET /api/v1/collections/offline?ids=a,b — note ids of collections kept offline (spec §14, BK-047)
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { offlineCollections } from "@/lib/collections/data";

export const dynamic = "force-dynamic";
const Ids = z.array(z.uuid()).max(50);

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = Ids.safeParse(raw ? raw.split(",") : []);
  if (!ids.success) return errorResponse("INVALID_INPUT", "Ongeldige collecties.", requestId);
  try {
    return json({ collections: await offlineCollections(auth.supabase, ids.data) }, requestId);
  } catch (err) {
    logError(requestId, "GET /collections/offline", err as { code?: string });
    return errorResponse("INTERNAL", "Collecties konden niet worden geladen.", requestId);
  }
}
