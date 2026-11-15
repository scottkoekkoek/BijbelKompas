/**
 * Minimal, self-contained Dutch status page for problems the proxy detects before any
 * page can render (missing configuration, Supabase unreachable). No personal data.
 */
export function statusPage(title: string, body: string, status = 503): Response {
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · BijbelKompas</title>
<style>
:root{--bg:#f7f3eb;--card:#fffdf8;--text:#243d35;--muted:#5b6b64;--border:#e7e1d5;--primary:#355d53}
@media (prefers-color-scheme:dark){:root{--bg:#1b2320;--card:#222c28;--text:#e8e3d8;--muted:#a9b3ad;--border:#36443e;--primary:#8fbcae}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;box-sizing:border-box;
background:var(--bg);color:var(--text);font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:460px;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:24px}
h1{font-size:1.4rem;margin:0 0 .5em}p{margin:.5em 0}.muted{color:var(--muted);font-size:.9rem}
a{color:var(--primary)}
</style></head><body><main><h1>${title}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
  });
}

export const MISSING_CONFIG = () =>
  statusPage(
    "De app mist een instelling",
    `<p>De verbinding met de database is niet ingesteld. Controleer in Vercel bij
<strong>Settings → Environment Variables</strong> of <code>NEXT_PUBLIC_SUPABASE_URL</code> en
<code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> bestaan voor <strong>Production</strong>,
en start daarna een nieuwe deployment (Redeploy).</p>
<p class="muted">Foutcode: CONFIG_MISSING</p>`,
  );

export const DATABASE_UNREACHABLE = () =>
  statusPage(
    "De database is even niet bereikbaar",
    `<p>BijbelKompas kan de database nu niet bereiken. Op het gratis plan zet Supabase een project
stil na een week zonder gebruik.</p>
<p>Open het <a href="https://supabase.com/dashboard">Supabase-dashboard</a>, kies
<strong>bijbelkompas-prod</strong> en klik op <strong>Restore</strong>. Probeer het daarna over een paar minuten opnieuw.</p>
<p class="muted">Foutcode: DATABASE_UNREACHABLE</p>`,
  );
