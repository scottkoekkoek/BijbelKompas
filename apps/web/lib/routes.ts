/** Paths reachable without signing in. Everything else requires a session. */
export const PUBLIC_PATHS = ["/login", "/wachtwoord-vergeten", "/auth/callback"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-site relative redirects after login (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
