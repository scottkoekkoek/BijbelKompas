import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readSupabaseEnv } from "@/lib/env";

/**
 * Ronde 3 §6 (pilot): a Supabase client with the SECRET key, for the few server steps that need it:
 * creating an invited account, setting a new password from a recovery link, and closing an
 * account's access. Server only (this file cannot be imported in the browser). Never use it to read
 * or write personal content: that always goes through the signed-in user's own client and RLS.
 * Returns null when SUPABASE_SECRET_KEY is not set; the pilot functions then say so.
 */
export function createAdminClient() {
  const env = readSupabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!env || !key) return null;
  return createSupabaseClient(env.url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
