// POST /api/v1/sync/push — idempotent batch of device operations (BK-027, spec §13.2).
// Each operation is atomic; the batch may partly succeed. Results per operation.
import { SyncPushInput, type SyncResult } from "@bk/schemas";
import { z } from "zod";
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
  return json({ results }, requestId);
}
