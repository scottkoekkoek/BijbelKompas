/** Paths reachable without signing in. Everything else requires a session. */
/** /offline holds no private data in its HTML: it shows what this browser stored itself (Sprint 5). */
/** /privacy (Ronde 4, V10): readable before an account exists, so a tester knows what they agree to. */
/** /uitnodiging (Ronde 3 §6): the page behind an invitation or recovery link; it shows nothing private. */
export const PUBLIC_PATHS = ["/login", "/wachtwoord-vergeten", "/auth/callback", "/offline", "/uitnodiging", "/auth/einde", "/privacy"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-site relative redirects after login (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
