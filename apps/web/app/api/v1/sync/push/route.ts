// POST /api/v1/sync/push — idempotent batch of device operations (BK-027, spec §13.2).
// Each operation is atomic; the batch may partly succeed. Results per operation.
import { SyncPushInput, type SyncResult } from "@bk/schemas";
import { after } from "next/server";
import { z } from "zod";
import { autoAnalyseAfter } from "@/lib/ai/auto";
import { authenticated, errorResponse, json, logError, newRequestId } from "@/lib/api";
import { applyOperation } from "@/lib/sync/server";

export const dynamic = "force-dynamic";

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
  const parsed = SyncPushInput.safeParse(raw);
  if (!parsed.success) return errorResponse("INVALID_INPUT", "Ongeldige wijzigingen.", requestId, z.flattenError(parsed.error));

  const results: SyncResult[] = [];
  for (const op of parsed.data.operations) {
    try {
      results.push(await applyOperation(auth.supabase, parsed.data.deviceId, op));
    } catch (err) {
      logError(requestId, "POST /sync/push", err as { code?: string });
      results.push({ operationId: op.operationId, status: "retryable" });
    }
  }
  // spec §8: automatic analysis only after finishing, and only when the owner switched it on
  const finished = parsed.data.operations.filter(
    (op, i) => op.reason === "afronden" && results[i]?.status === "accepted",
  );
  if (finished.length > 0) {
    after(async () => {
      for (const op of finished) await autoAnalyseAfter(auth.supabase, op.noteId, requestId);
    });
  }
  return json({ results }, requestId);
}
