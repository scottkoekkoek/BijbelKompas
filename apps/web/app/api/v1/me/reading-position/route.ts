// PUT /api/v1/me/reading-position — remember where the owner is reading ("verder lezen")
import { ReadingPositionInput } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const { supabase, user } = auth;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = ReadingPositionInput.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("INVALID_INPUT", "Ongeldige leespositie.", requestId, z.flattenError(parsed.error));
  }

  const [book, translation] = await Promise.all([
    supabase.from("bible_books").select("id").eq("book_code", parsed.data.book).maybeSingle(),
    supabase.from("bible_translations").select("id").eq("code", parsed.data.translation).maybeSingle(),
  ]);
  if (!book.data || !translation.data) return errorResponse("INVALID_INPUT", "Onbekend boek of vertaling.", requestId);

  const { error } = await supabase.from("reading_positions").upsert(
    {
      owner_id: user.id,
      translation_id: translation.data.id,
      book_id: book.data.id,
      chapter_number: parsed.data.chapter,
    },
    { onConflict: "owner_id" },
  );
  if (error) {
    if (error.code === "23514") return errorResponse("INVALID_INPUT", "Dit hoofdstuk bestaat niet.", requestId);
    logError(requestId, "PUT /me/reading-position", error);
    return errorResponse("INTERNAL", "Leespositie opslaan is mislukt.", requestId);
  }
  return json(parsed.data, requestId);
}
