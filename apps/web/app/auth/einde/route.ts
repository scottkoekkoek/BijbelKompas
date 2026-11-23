import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Ronde 3 §6: a session the auth server no longer accepts (access closed by an administrator, or
 * the session was ended) still has a cookie that looks valid. Clear it here, then go to login.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.redirect(new URL("/login?fout=toegang", request.nextUrl.origin));
}
