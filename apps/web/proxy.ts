import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "@/lib/env";
import { isPublicPath } from "@/lib/routes";
import { DATABASE_UNREACHABLE, MISSING_CONFIG } from "@/lib/status-page";

/**
 * BK-003: refreshes the Supabase session cookie on every request and sends
 * visitors without a valid session to /login. API routes answer 401 themselves.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = readSupabaseEnv();
  if (!env) {
    // Without configuration nothing behind the login can work: say so clearly (no secrets shown).
    console.error(JSON.stringify({ level: "error", route: "proxy", code: "CONFIG_MISSING" }));
    if (isPublicPath(request.nextUrl.pathname)) return response;
    return MISSING_CONFIG();
  }

  const { url, key } = env;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() verifies the JWT; never trust an unverified session cookie.
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    // Supabase unreachable (e.g. free project paused): explain instead of a generic 500.
    console.error(JSON.stringify({ level: "error", route: "proxy", code: "DATABASE_UNREACHABLE" }));
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return Response.json(
        { error: { code: "INTERNAL", message: "Database niet bereikbaar.", requestId: crypto.randomUUID() } },
        { status: 503 },
      );
    }
    return DATABASE_UNREACHABLE();
  }
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/")) return response;

  if (!signedIn && !isPublicPath(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  if (signedIn && (pathname === "/login" || pathname === "/")) {
    const home = request.nextUrl.clone();
    home.pathname = "/dashboard";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
