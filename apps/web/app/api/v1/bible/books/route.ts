// GET /api/v1/bible/books — the 66 books in canonical order (BK-009)
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBooks } from "@/lib/bible-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  try {
    return json({ books: await getBooks(auth.supabase) }, requestId);
  } catch (err) {
    logError(requestId, "GET /bible/books", err as { code?: string });
    return errorResponse("INTERNAL", "Bijbelboeken konden niet worden geladen.", requestId);
  }
}
