// GET /api/v1/notes (list, filters) and POST /api/v1/notes (BK-016)
import { CreateNoteInput, NoteStatus, NoteType } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getBooks, getTranslations, pickTranslation } from "@/lib/bible-data";
import { createNote, listNotes } from "@/lib/notes/data";

export const dynamic = "force-dynamic";

const Query = z.object({
  q: z.string().max(100).optional(),
  type: NoteType.optional(),
  status: NoteStatus.optional(),
  archived: z.enum(["0", "1"]).optional(),
});

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldig filter.", requestId, z.flattenError(parsed.error));
  try {
    const notes = await listNotes(auth.supabase, { ...parsed.data, archived: parsed.data.archived === "1" });
    return json({ notes }, requestId);
  } catch (err) {
    logError(requestId, "GET /notes", err as { code?: string });
    return errorResponse("INTERNAL", "Notities konden niet worden geladen.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = CreateNoteInput.safeParse(raw);
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldige notitie.", requestId, z.flattenError(parsed.error));
  try {
    const [books, translations] = await Promise.all([getBooks(auth.supabase), getTranslations(auth.supabase)]);
    const translation = pickTranslation(translations, undefined, null)?.code ?? "SV";
    const result = await createNote(auth.supabase, parsed.data, {
      books: books.map((b) => ({ code: b.code, name: b.name, chapterCount: b.chapterCount })),
      translation,
    });
    if (!result.ok) return errorResponse("INVALID_INPUT", result.message, requestId, result.details);
    return json(result.note, requestId, 201);
  } catch (err) {
    logError(requestId, "POST /notes", err as { code?: string });
    return errorResponse("INTERNAL", "De notitie kon niet worden aangemaakt.", requestId);
  }
}
