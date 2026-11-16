// GET /api/v1/sync/notes?ids=a,b — full notes (document + sermon details) for the offline copy.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { getNote } from "@/lib/notes/data";

export const dynamic = "force-dynamic";

const Ids = z.array(z.uuid()).min(1).max(20);

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const ids = Ids.safeParse((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean));
  if (!ids.success) return errorResponse("INVALID_INPUT", "Ongeldige lijst.", requestId);
  try {
    const notes = (await Promise.all(ids.data.map((id) => getNote(auth.supabase, id)))).filter((n) => n !== null);
    return json({ notes }, requestId);
  } catch (err) {
    logError(requestId, "GET /sync/notes", err as { code?: string });
    return errorResponse("INTERNAL", "Ophalen is mislukt.", requestId);
  }
}
