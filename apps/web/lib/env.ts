/**
 * Keeps only scheme + host of the Supabase URL. A value copied with a path such as
 * "/rest/v1/" (or a trailing slash) would otherwise make every auth call 404.
 * Returns null for anything that is not a valid http(s) URL.
 */
export function normalizeSupabaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Public Supabase settings, or null when missing/invalid. Only the URL and publishable key may reach the browser. */
export function readSupabaseEnv(): { url: string; key: string } | null {
  // Literal process.env.NEXT_PUBLIC_* access so Next inlines them in the browser bundle.
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function supabaseEnv(): { url: string; key: string } {
  const env = readSupabaseEnv();
  if (!env) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ontbreken of zijn ongeldig (zie .env.example)");
  }
  return env;
}
