// GET /api/v1/passages/study?translation=SV&book=JHN&chapter=15&from=5&to=5 — "Mijn studie bij dit vers":
// the owner's notes and research questions linked to (part of) these verses (feature 1).
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { passageStudy } from "@/lib/reader/study";

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

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const q = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return errorResponse("INVALID_INPUT", "Ongeldige verzen.", requestId);
  try {
    return json(await passageStudy(auth.supabase, q.data), requestId);
  } catch (err) {
    logError(requestId, "GET /passages/study", err as { code?: string });
    return errorResponse("INTERNAL", "Ophalen is mislukt.", requestId);
  }
}
