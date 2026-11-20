// POST /api/v1/reading — feature 6: mark verses (or a whole chapter: from 1 to 999) as read or unread.
// Only this explicit action changes reading progress; opening or scrolling a chapter never does.
import { z } from "zod";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    translation: z.string().regex(/^[A-Z0-9_]{2,20}$/),
    book: z.string().regex(/^[1-3]?[A-Z]{2,3}$/),
    chapter: z.number().int().min(1).max(150),
    from: z.number().int().min(1).max(999),
    to: z.number().int().min(1).max(999),
    read: z.boolean(),
  })
  .strict()
  .refine((b) => b.from <= b.to);

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const body = await readBody(request, Body, requestId, "Ongeldige verzen.");
  if (!body.ok) return body.response;
  const b = body.data;
  const { data, error } = await auth.supabase.rpc("reading_mark", {
    p_translation: b.translation, p_book: b.book, p_chapter: b.chapter, p_start: b.from, p_end: b.to, p_read: b.read,
  });
  if (error) {
    if (error.code === "22023") return errorResponse("INVALID_INPUT", "Deze verzen bestaan niet.", requestId);
    logError(requestId, "POST /reading", error);
    return errorResponse("INTERNAL", "Bewaren van je leesvoortgang is mislukt.", requestId);
  }
  return json({ changed: data as number }, requestId);
}
