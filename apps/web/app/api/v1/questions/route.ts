// GET /api/v1/questions (?status=) and POST (BK-049)
import { QuestionInput, QuestionStatus } from "@bk/schemas";
import { authenticated, errorResponse, json, logError, newRequestId, readBody } from "@/lib/api";
import { createQuestion, listQuestions } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const status = QuestionStatus.safeParse(new URL(request.url).searchParams.get("status")).data;
  try {
    return json({ questions: await listQuestions(auth.supabase, status) }, requestId);
  } catch (err) {
    logError(requestId, "GET /questions", err as { code?: string });
    return errorResponse("INTERNAL", "Vragen konden niet worden geladen.", requestId);
  }
}

export async function POST(request: Request) {
  const requestId = newRequestId();
  const auth = await authenticated();
  if (!auth) return errorResponse("UNAUTHENTICATED", "Je bent niet ingelogd.", requestId);
  const body = await readBody(request, QuestionInput, requestId, "Schrijf de vraag op.");
  if (!body.ok) return body.response;
  try {
    return json(await createQuestion(auth.supabase, body.data), requestId, 201);
  } catch (err) {
    if ((err as { code?: string }).code === "22023") return errorResponse("INVALID_INPUT", "Dit Bijbelgedeelte bestaat niet in deze vertaling.", requestId);
    logError(requestId, "POST /questions", err as { code?: string });
    return errorResponse("INTERNAL", "De vraag kon niet worden bewaard.", requestId);
  }
}
