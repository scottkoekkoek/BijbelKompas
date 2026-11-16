/*
 * BijbelKompas service worker (BK-029, ADR-006).
 * Caches ONLY the app shell: the static /offline page and the build files it needs. Personal notes
 * are never cached here; they live in IndexedDB. Pages that cannot load go to /offline.
 */
const SHELL = "bk-shell-v1";
const STATIC = "bk-static-v1";
const OFFLINE_URL = "/offline";

/** Build files referenced by the offline page (script tags and the chunks named in its payload). */
function assetsIn(html) {
  const found = new Set();
  for (const m of html.matchAll(/\/?(?:_next\/)?(static\/(?:chunks|css|media)\/[^"'\\\s)]+)/g)) found.add(`/_next/${m[1]}`);
  return [...found].sort();
}

async function cacheOfflineShell() {
  const res = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "same-origin", redirect: "error" });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = assetsIn(html);
  const shell = await caches.open(SHELL);
  const previous = await shell.match(OFFLINE_URL);
  if (previous) {
    const old = assetsIn(await previous.text());
    // a new deployment: drop old build files (other pages fetch theirs again when online)
    if (old.join("|") !== assets.join("|")) await caches.delete(STATIC);
  }
  const statics = await caches.open(STATIC);
  await Promise.all(
    assets.map(async (a) => {
      if (!(await statics.match(a))) await statics.add(a).catch(() => undefined);
    }),
  );
  await shell.put(OFFLINE_URL, res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheOfflineShell()
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "refresh-offline") event.waitUntil(cacheOfflineShell().catch(() => undefined));
});

const OFFLINE_FALLBACK = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · BijbelKompas</title><body style="font-family:system-ui;padding:24px"><h1>Je bent offline</h1><p>Open BijbelKompas één keer met internet; daarna kun je hier ook offline schrijven.</p></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // build files never change under the same name: cache first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // pages: always the network (fresh, private data); without network the offline screen
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        if (url.pathname === OFFLINE_URL) {
          const hit = await caches.match(OFFLINE_URL, { ignoreSearch: true });
          return hit ?? new Response(OFFLINE_FALLBACK, { headers: { "content-type": "text/html; charset=utf-8" } });
        }
        const note = /^\/notes\/([0-9a-f-]{36})$/.exec(url.pathname);
        const target = new URL(note ? `${OFFLINE_URL}?notitie=${note[1]}` : OFFLINE_URL, self.location.origin);
        return Response.redirect(target.href, 302);
      }),
    );
  }
  // everything else (API, data): straight to the network, never cached
});
