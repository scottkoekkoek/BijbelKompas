// GET /api/v1/health — is the app up and can it reach Supabase? (BK-059)
// Open without login, so a monitor can call it. It returns no personal data at all: no counts, no
// user, no configuration. Only "ok" or "storing", the time, and the app version.
import { readSupabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = readSupabaseEnv();
  let database = false;
  if (env) {
    try {
      const res = await fetch(`${env.url}/auth/v1/health`, { headers: { apikey: env.key }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      database = res.ok;
    } catch {
      database = false;
    }
  }
  const ok = Boolean(env) && database;
  if (!ok) console.error(JSON.stringify({ level: "error", route: "GET /health", code: env ? "DATABASE_UNREACHABLE" : "CONFIG_MISSING" }));
  return Response.json(
    { status: ok ? "ok" : "storing", database: database ? "bereikbaar" : "niet bereikbaar", time: new Date().toISOString(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "lokaal" },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
