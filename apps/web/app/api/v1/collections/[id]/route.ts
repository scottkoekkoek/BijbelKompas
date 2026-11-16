// GET / PATCH /api/v1/collections/{id} (BK-047). Collections are archived, never deleted.
import { CollectionUpdate } from "@bk/schemas";
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { collectionNotes, getCollection, isInvalid, updateCollection } from "@/lib/collections/data";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const Id = z.uuid();

export async function GET(_req: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
  try {
    const c = await getCollection(auth.supabase, id.data);
    if (!c) return errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
    return json({ ...c, notes: await collectionNotes(auth.supabase, id.data) }, requestId);
  } catch (err) {
    logError(requestId, "GET /collections/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De collectie kon niet worden geladen.", requestId);
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const id = Id.safeParse((await ctx.params).id);
  if (!id.success) return errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
  const body = await readBody(request, CollectionUpdate, requestId, "De collectie is niet compleet.");
  if (!body.ok) return body.response;
  try {
    const c = await updateCollection(auth.supabase, id.data, body.data);
    return c ? json(c, requestId) : errorResponse("NOT_FOUND", "Collectie niet gevonden.", requestId);
  } catch (err) {
    if (isInvalid(err)) return errorResponse("INVALID_INPUT", "Een collectie kan niet onder zichzelf of een eigen onderdeel staan.", requestId);
    logError(requestId, "PATCH /collections/:id", err as { code?: string });
    return errorResponse("INTERNAL", "De collectie kon niet worden bewaard.", requestId);
  }
}

