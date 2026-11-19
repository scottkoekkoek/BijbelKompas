// GET /api/v1/highlights?translation&book&chapter — the owner's highlights in a chapter (BK-013)
// POST /api/v1/highlights {passage, label, color, annotation} — highlight a passage; the same passage again changes its color
import { BookCode, HighlightCreate, TranslationCode } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { addHighlight, chapterHighlights, isInvalidHighlight } from "@/lib/reader/data";

export const dynamic = "force-dynamic";

const Query = z.object({ translation: TranslationCode, book: BookCode, chapter: z.coerce.number().int().min(1).max(150) });

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return errorResponse("INVALID_INPUT", "Ongeldige verwijzing.", requestId);
  try {
    return json({ highlights: await chapterHighlights(auth.supabase, q.data.translation, q.data.book, q.data.chapter) }, requestId);
  } catch (err) {
    logError(requestId, "GET /highlights", err as { code?: string });
    return errorResponse("INTERNAL", "De markeringen konden niet worden geladen.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const body = await readBody(request, HighlightCreate, requestId, "Ongeldige markering.");
  if (!body.ok) return body.response;
  try {
    return json(await addHighlight(auth.supabase, body.data), requestId, 201);
  } catch (err) {
    if (isInvalidHighlight(err)) return errorResponse("INVALID_INPUT", "Deze verzen bestaan niet of de kleur kan niet.", requestId);
    logError(requestId, "POST /highlights", err as { code?: string });
    return errorResponse("INTERNAL", "De markering kon niet worden bewaard.", requestId);
  }
}
