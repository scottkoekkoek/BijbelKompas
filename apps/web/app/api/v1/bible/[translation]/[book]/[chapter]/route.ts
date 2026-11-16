// GET /api/v1/bible/{translation}/{book}/{chapter} — one chapter in the translation's own numbering (BK-009, BK-010)
import { BookCode, TranslationCode } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBooks, getChapter, getTranslations } from "@/lib/bible-data";

export const dynamic = "force-dynamic";

const Params = z.object({
  translation: TranslationCode,
  book: BookCode,
  chapter: z.coerce.number().int().min(1).max(150),
});

export async function GET(_req: Request, ctx: { params: Promise<{ translation: string; book: string; chapter: string }> }) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);

  const raw = await ctx.params;
  const parsed = Params.safeParse({ ...raw, translation: raw.translation.toUpperCase(), book: raw.book.toUpperCase() });
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldige verwijzing.", requestId, z.flattenError(parsed.error));
  const { translation: code, book: bookCode, chapter } = parsed.data;

  try {
    const [books, translations] = await Promise.all([getBooks(auth.supabase), getTranslations(auth.supabase)]);
    const book = books.find((b) => b.code === bookCode);
    const translation = translations.find((t) => t.code === code);
    if (!book || chapter > book.chapterCount) return errorResponse("NOT_FOUND", "Dit hoofdstuk bestaat niet.", requestId);
    if (!translation) return errorResponse("NOT_FOUND", "Deze vertaling is niet beschikbaar.", requestId);
    if (!translation.hasText) {
      // HSV/NBV21: reference only, never text (afspraak 2).
      return errorResponse("FORBIDDEN", "Van deze vertaling tonen we alleen een verwijzing.", requestId, {
        externalUrl: translation.externalUrl,
      });
    }
    return json(await getChapter(auth.supabase, translation, book, chapter), requestId);
  } catch (err) {
    logError(requestId, "GET /bible/chapter", err as { code?: string });
    return errorResponse("INTERNAL", "Het hoofdstuk kon niet worden geladen.", requestId);
  }
}
