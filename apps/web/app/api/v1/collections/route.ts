// GET /api/v1/collections (own, not archived; ?archief=1 for archived) and POST (BK-047)
import { CollectionInput } from "@bk/schemas";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { createCollection, isInvalid, listCollections } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    const archived = new URL(request.url).searchParams.get("archief") === "1";
    return json({ collections: await listCollections(auth.supabase, archived) }, requestId);
  } catch (err) {
    logError(requestId, "GET /collections", err as { code?: string });
    return errorResponse("INTERNAL", "Collecties konden niet worden geladen.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const body = await readBody(request, CollectionInput, requestId, "De collectie is niet compleet.");
  if (!body.ok) return body.response;
  try {
    return json(await createCollection(auth.supabase, body.data), requestId, 201);
  } catch (err) {
    if (isInvalid(err)) return errorResponse("INVALID_INPUT", "Deze bovenliggende collectie kan niet.", requestId);
    logError(requestId, "POST /collections", err as { code?: string });
    return errorResponse("INTERNAL", "De collectie kon niet worden bewaard.", requestId);
  }
}
