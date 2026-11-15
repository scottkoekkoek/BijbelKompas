/** Public Supabase settings. Only the URL and publishable (anon) key may reach the browser. */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ontbreken (zie .env.example)");
  }
  return { url, key };
}
