import "server-only";
import { randomUUID } from "node:crypto";
import { apiError, ERROR_STATUS, type ErrorCode } from "@bk/schemas";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export function newRequestId(): string {
  return randomUUID();
}

export function errorResponse(code: ErrorCode, message: string, requestId: string, details?: unknown) {
  return NextResponse.json(apiError(code, message, requestId, details), {
    status: ERROR_STATUS[code],
    headers: { "x-request-id": requestId },
  });
}

export function json<T>(body: T, requestId: string, status = 200) {
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}

/** Returns a Supabase client bound to the verified user, or null when not signed in. */
export async function authenticated() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

/** Logs without personal content: only request id, route and error code (spec §15, BK-059). */
export function logError(requestId: string, route: string, err: { code?: string; message?: string } | null) {
  console.error(JSON.stringify({ level: "error", requestId, route, code: err?.code ?? "unknown" }));
}
