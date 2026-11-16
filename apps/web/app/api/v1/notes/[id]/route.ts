// GET /api/v1/notes/{id} and PUT /api/v1/notes/{id} (save with version check: BK-018, BK-021, BK-022)
import { SaveNoteInput } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getNote, saveNote } from "@/lib/notes/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const Id = z.uuid();

export async function GET(_req: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  try {
    const note = await getNote(auth.supabase, id.data);
    return note ? json(note, requestId) : errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  } catch (err) {
    logError(requestId, "GET /notes/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De notitie kon niet worden geladen.", requestId);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId);
  }
  const parsed = SaveNoteInput.safeParse(raw);
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldige notitie.", requestId, z.flattenError(parsed.error));

  try {
    const result = await saveNote(auth.supabase, id.data, parsed.data);
    if (result.ok) return json(result.note, requestId);
    if (result.kind === "conflict") {
      return errorResponse(
        "REVISION_CONFLICT",
        "Deze notitie is intussen ergens anders gewijzigd. Je tekst is niet overschreven.",
        requestId,
        { current: result.current },
      );
    }
    if (result.kind === "not_found") return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    return errorResponse("INVALID_INPUT", result.message, requestId, result.details);
  } catch (err) {
    logError(requestId, "PUT /notes/:id", err as { code?: string });
    return errorResponse("INTERNAL", "Opslaan is mislukt.", requestId);
  }
}
