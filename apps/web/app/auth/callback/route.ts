import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the one-time code from an e-mail link (password reset, invitation) for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?fout=link", url.origin));
}
