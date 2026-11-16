// GET /api/v1/passages/notes?translation=SV&book=GEN&chapter=1&from=1&to=3 — the owner's notes
// linked to these verses, with the linked block (BK-031).
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";

export const dynamic = "force-dynamic";

const Query = z
  .object({
    translation: z.string().regex(/^[A-Z0-9_]{2,20}$/),
    book: z.string().regex(/^[1-3]?[A-Z]{2,3}$/),
    chapter: z.coerce.number().int().min(1).max(150),
    from: z.coerce.number().int().min(1).max(999),
    to: z.coerce.number().int().min(1).max(999),
  })
  .refine((q) => q.from <= q.to);

type Row = { note_id: string; title: string; note_type: string; updated_at: string; block_id: string; reference_text: string; snippet: string | null };

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return errorResponse("INVALID_INPUT", "Ongeldige verzen.", requestId);
  const { data, error } = await auth.supabase.rpc("passage_notes", {
    p_translation: q.data.translation,
    p_book: q.data.book,
    p_chapter: q.data.chapter,
    p_start_verse: q.data.from,
    p_end_verse: q.data.to,
  });
  if (error) {
    logError(requestId, "GET /passages/notes", error);
    return errorResponse("INTERNAL", "Ophalen is mislukt.", requestId);
  }
  const notes = ((data ?? []) as Row[]).map((r) => ({
    noteId: r.note_id,
    title: r.title,
    noteType: r.note_type,
    updatedAt: r.updated_at,
    blockId: r.block_id,
    reference: r.reference_text,
    snippet: r.snippet ?? "",
  }));
  return json({ notes }, requestId);
}
