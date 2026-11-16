// POST /api/v1/questions/{id}/links {action: addNote|removeNote|addPassage|removePassage} (BK-050)
import { QuestionLinkChange } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { addQuestionPassage, getQuestion, isInvalid, linkQuestionNote, questionLinks, removeQuestionPassage } from "@/lib/collections/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
  const body = await readBody(request, QuestionLinkChange, requestId, "Ongeldige koppeling.");
  if (!body.ok) return body.response;
  try {
    if (!(await getQuestion(auth.supabase, id.data))) return errorResponse("NOT_FOUND", "Vraag niet gevonden.", requestId);
    const c = body.data;
    if (c.action === "addNote" || c.action === "removeNote") await linkQuestionNote(auth.supabase, id.data, c.noteId, c.action === "addNote");
    else if (c.action === "addPassage") await addQuestionPassage(auth.supabase, id.data, { ...c.passage, label: c.label });
    else await removeQuestionPassage(auth.supabase, id.data, c.passageId);
    return json(await questionLinks(auth.supabase, id.data), requestId);
  } catch (err) {
    if (isInvalid(err)) return errorResponse("INVALID_INPUT", "Deze koppeling kan niet: de notitie of tekst bestaat niet.", requestId);
    logError(requestId, "POST /questions/:id/links", err as { code?: string });
    return errorResponse("INTERNAL", "De koppeling kon niet worden bewaard.", requestId);
  }
}
