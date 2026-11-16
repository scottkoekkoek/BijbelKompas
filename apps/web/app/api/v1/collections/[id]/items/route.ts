// POST /api/v1/collections/{id}/items {action: add|remove|order} (BK-047, BK-048)
import { CollectionItemsChange } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { addToCollection, collectionNotes, getCollection, isInvalid, removeFromCollection, reorderCollection } from "@/lib/collections/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
  const body = await readBody(request, CollectionItemsChange, requestId, "Ongeldige wijziging.");
  if (!body.ok) return body.response;
  try {
    if (!(await getCollection(auth.supabase, id.data))) return errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
    const change = body.data;
    if (change.action === "add") await addToCollection(auth.supabase, id.data, change.noteId);
    else if (change.action === "remove") await removeFromCollection(auth.supabase, id.data, change.noteId);
    else await reorderCollection(auth.supabase, id.data, change.noteIds);
    return json({ notes: await collectionNotes(auth.supabase, id.data) }, requestId);
  } catch (err) {
    if (isInvalid(err)) return errorResponse("NOT_FOUND", "Notitie niet gevonden.", requestId);
    logError(requestId, "POST /collections/:id/items", err as { code?: string });
    return errorResponse("INTERNAL", "De collectie kon niet worden bijgewerkt.", requestId);
  }
}
