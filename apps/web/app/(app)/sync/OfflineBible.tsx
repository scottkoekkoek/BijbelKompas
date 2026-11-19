"use client";
/** BK-014: keep an allowed Bible translation on this device, or remove it again. */
import { useCallback, useEffect, useState } from "react";
import { getMeta, setMeta, type BookInfo, type OfflineTranslation } from "@/lib/offline/db";
import { allowedOffline, downloadTranslation, pruneOfflineBible, type OfflineAllowed } from "@/lib/offline/bible";
import { removeBibleTranslation } from "@/lib/offline/db";

async function books(): Promise<BookInfo[]> {
  const meta = await getMeta();
  if (meta.books.length > 0) return meta.books;
  const res = await fetch("/api/v1/bible/books", { cache: "no-store" });
  if (!res.ok) throw new Error();
  const b = ((await res.json()) as { books: BookInfo[] }).books.map((x) => ({ code: x.code, name: x.name, chapterCount: x.chapterCount }));
  await setMeta({ books: b });
  return b;
}

export function OfflineBible() {
  const [allowed, setAllowed] = useState<OfflineAllowed[] | null>(null);
  const [stored, setStored] = useState<Record<string, OfflineTranslation>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await allowedOffline();
      await pruneOfflineBible(list.map((t) => t.code));
      setAllowed(list);
    } catch {
      setAllowed((a) => a ?? []);
    }
    try {
      setStored((await getMeta()).offlineBible);
    } catch {
      setStored({});
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server and IndexedDB on mount
    void load();
  }, [load]);

  async function save(t: OfflineAllowed) {
    setBusy(t.code);
    setError("");
    try {
      const list = await books();
      await downloadTranslation(t, list, (done, total) => setStatus(`${t.code}: boek ${done} van ${total}…`));
      const entry = (await getMeta()).offlineBible[t.code];
      setStatus(`${t.name} staat nu op dit apparaat (${entry?.chapters ?? 0} hoofdstukken).`);
      void navigator.storage?.persist?.();
    } catch {
      setStatus("");
      setError("Bewaren is niet gelukt. Wat al binnen was, blijft staan; probeer het opnieuw met internet.");
    } finally {
      setBusy(null);
      void load();
    }
  }

  async function remove(code: string) {
    setBusy(code);
    try {
      await removeBibleTranslation(code);
      setStatus(`${code} is van dit apparaat verwijderd.`);
    } finally {
      setBusy(null);
      void load();
    }
  }

  return (
    <section className="settings-section" aria-labelledby="sync-bible">
      <h2 id="sync-bible">Bijbel op dit apparaat</h2>
      <p className="page-intro">
        Een vertaling die offline mag, kun je op dit apparaat bewaren om zonder internet te lezen. De HSV en NBV21 zijn
        beschermd: die openen we alleen via een link en kunnen niet offline worden bewaard.
      </p>
      {allowed === null ? (
        <p role="status">Laden…</p>
      ) : allowed.length === 0 && Object.keys(stored).length === 0 ? (
        <p>Er is nu geen vertaling die offline bewaard mag worden.</p>
      ) : (
        <ul className="offline-bible-list">
          {allowed.map((t) => {
            const s = stored[t.code];
            return (
              <li key={t.code}>
                <strong>{t.name}</strong> ({t.code}){" · "}
                {s ? `${s.chapters} hoofdstukken op dit apparaat` : "niet op dit apparaat"}
                <div className="button-row">
                  <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void save(t)}>
                    {s ? `${t.code} opnieuw bewaren` : `${t.code} offline bewaren`}
                  </button>
                  {s && (
                    <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void remove(t.code)}>
                      {t.code} verwijderen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="muted">
        {status}
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
