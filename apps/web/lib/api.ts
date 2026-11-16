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
    headers: { "x-request-id": requestId, "cache-control": "no-store" },
  });
}

export function json<T>(body: T, requestId: string, status = 200) {
  // Everything behind the API is private: never let a browser or proxy cache store it.
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId, "cache-control": "no-store" } });
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

/** Reads a JSON body and checks it against a schema; returns the parsed value or an error response. */
export async function readBody<T>(
  request: Request,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: unknown } },
  requestId: string,
  message: string,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: errorResponse("INVALID_INPUT", "Ongeldige JSON.", requestId) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: errorResponse("INVALID_INPUT", message, requestId) };
  return { ok: true, data: parsed.data };
}
