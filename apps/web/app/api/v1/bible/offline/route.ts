// BK-014: Bible text to keep on this device, only for translations whose rights allow it (ADR-010).
// GET /api/v1/bible/offline                         — which translations may be kept offline
// GET /api/v1/bible/offline?translation=SV&book=GEN — every chapter of one book
// HSV/NBV21 and any other reference-only translation never come back here (afspraak 2).
import { BookCode, TranslationCode } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBookForOffline, getBooks, getTranslations } from "@/lib/bible-data";

export const dynamic = "force-dynamic";

const Query = z.object({ translation: TranslationCode, book: BookCode });

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const params = new URL(request.url).searchParams;
  try {
    const translations = await getTranslations(auth.supabase);
    if (!params.has("translation")) {
      return json(
        { translations: translations.filter((t) => t.offlineAllowed).map((t) => ({ code: t.code, name: t.name, attribution: t.attribution })) },
        requestId,
      );
    }
    const q = Query.safeParse({ translation: params.get("translation")?.toUpperCase(), book: params.get("book")?.toUpperCase() });
    if (!q.success) return errorResponse("INVALID_INPUT", "Ongeldige vertaling of ongeldig boek.", requestId);
    const translation = translations.find((t) => t.code === q.data.translation);
    if (!translation) return errorResponse("NOT_FOUND", "Deze vertaling is niet beschikbaar.", requestId);
    if (!translation.offlineAllowed) return errorResponse("FORBIDDEN", "Deze vertaling mag niet offline worden bewaard.", requestId);
    const book = (await getBooks(auth.supabase)).find((b) => b.code === q.data.book);
    if (!book) return errorResponse("NOT_FOUND", "Dit boek bestaat niet.", requestId);
    return json({ translation: translation.code, book: book.code, chapters: await getBookForOffline(auth.supabase, translation, book) }, requestId);
  } catch (err) {
    logError(requestId, "GET /bible/offline", err as { code?: string });
    return errorResponse("INTERNAL", "De Bijbeltekst kon niet worden geladen.", requestId);
  }
}
