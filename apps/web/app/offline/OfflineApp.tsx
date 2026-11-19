"use client";
/**
 * BK-029: the offline screen. The service worker shows it when a page cannot be loaded. Everything
 * here comes from this browser's own storage; the HTML itself holds no personal data.
 */
import { EMPTY_SERMON, type Note } from "@bk/schemas";
import { useCallback, useEffect, useState } from "react";
import { BrandMark } from "@/components/icons";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { SyncIndicator, SyncStarter } from "@/components/sync/SyncStatus";
import { emptyDocument } from "@/lib/notes/document";
import { getMeta, listOutbox, listStored, saveLocal, type BookInfo, type OfflineTranslation } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";
import type { OutboxEntry, StoredNote } from "@/lib/offline/types";
import { noteFromStored } from "@/lib/offline/view";
import { OfflineBibleReader } from "./OfflineBibleReader";

type Item = { note: Note; unsynced: boolean; stamp: number | null };
type State = { items: Item[]; books: BookInfo[]; translation: string; bible: Record<string, OfflineTranslation> };

const NO_SUGGESTIONS = { speakers: [], organizations: [], series: [] };

function toItem(s: StoredNote, entry?: OutboxEntry): Item | null {
  const note = noteFromStored(s, entry);
  return note ? { note, unsynced: Boolean(s.local), stamp: s.localUpdatedAt } : null;
}

export function OfflineApp() {
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [biblePath, setBiblePath] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

  const load = useCallback(async () => {
    try {
      const [stored, outbox, meta] = await Promise.all([listStored(), listOutbox(), getMeta()]);
      const byId = new Map(outbox.map((e) => [e.noteId, e]));
      const items = stored
        .map((s) => toItem(s, byId.get(s.id)))
        .filter((i): i is Item => i !== null && !i.note.archived)
        .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));
      setState({ items, books: meta.books, translation: meta.defaultTranslation, bible: meta.offlineBible });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const id = search.get("notitie");
    const bijbel = search.get("bijbel");
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the address once on mount
    if (id && /^[0-9a-f-]{36}$/.test(id)) setOpenId(id);
    else if (bijbel && /^[A-Za-z0-9_/]{1,40}$/.test(bijbel)) setBiblePath(bijbel);
    void load();
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [load]);

  function read(path: string | null) {
    setOpenId(null);
    setBiblePath(path);
    window.history.replaceState(null, "", path ? `/offline?bijbel=${path}` : "/offline");
    void load();
    window.scrollTo(0, 0);
  }

  function open(id: string | null) {
    setOpenId(id);
    setBiblePath(null);
    const url = id ? `/offline?notitie=${id}` : "/offline";
    window.history.replaceState(null, "", url);
    void load();
    window.scrollTo(0, 0);
  }

  async function newNote() {
    const id = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    await saveLocal(
      id,
      { content: { title: "", noteType: "vrij", eventDate: today, sermon: EMPTY_SERMON, document: emptyDocument(crypto.randomUUID()) } },
      { createdLocally: true },
    );
    syncEngine.syncSoon();
    open(id);
  }

  const current = openId ? state?.items.find((i) => i.note.id === openId) : undefined;

  return (
    <div className="offline-page">
      <SyncStarter />
      <header className="offline-header">
        <p className="brand">
          <BrandMark />
          BijbelKompas
        </p>
        <SyncIndicator href="/sync" />
      </header>
      <main id="inhoud" className="main" tabIndex={-1}>
        {!online && (
          <p className="alert ok offline-banner">
            Je bent offline. Je kunt je offline notities lezen en bewerken; alles wordt verstuurd zodra er weer verbinding is.
          </p>
        )}
        {online && (
          <p className="offline-banner">
            <a href="/dashboard">Terug naar BijbelKompas</a>
          </p>
        )}

        {failed && <p className="alert error">Deze browser kan niets lokaal bewaren. Offline schrijven werkt hier niet.</p>}
        {!failed && !state && <p role="status">Laden…</p>}

        {state && openId && !current && (
          <>
            <p className="alert error">Deze notitie staat niet op dit apparaat.</p>
            <button type="button" className="button secondary" onClick={() => open(null)}>Alle offline notities</button>
          </>
        )}

        {state && current && (
          <article className="note-page">
            <p className="crumb">
              <button type="button" className="link-button" onClick={() => open(null)}>Offline notities</button>
            </p>
            <h1 className="visually-hidden">{current.note.title || "Naamloze notitie"}</h1>
            <NoteEditor
              key={current.note.id}
              note={current.note}
              unsynced={current.unsynced}
              localStamp={current.stamp}
              books={state.books}
              defaultTranslation={state.translation}
              suggestions={NO_SUGGESTIONS}
              offline
              onOpenNote={(id) => open(id)}
            />
          </article>
        )}

        {state && !openId && biblePath && <OfflineBibleReader key={biblePath} path={biblePath} onNavigate={read} />}

        {state && !openId && !biblePath && (
          <>
            <h1>Offline notities</h1>
            <p className="page-intro">
              Dit zijn de notities die op dit apparaat staan: je recente notities, wat je vastzette en alles wat nog
              verstuurd moet worden.
            </p>
            <button type="button" className="button" onClick={() => void newNote()}>Nieuwe notitie</button>
            {state.items.length === 0 ? (
              <p>Er staan nog geen notities op dit apparaat. Open een notitie terwijl je online bent om hem offline te hebben.</p>
            ) : (
              <ul className="offline-list">
                {state.items.map((i) => (
                  <li key={i.note.id}>
                    <button type="button" onClick={() => open(i.note.id)}>
                      <span className="title">{i.note.title || "Naamloze notitie"}</span>
                      <span className="note-list-meta">
                        {" · "}
                        {i.unsynced ? "nog niet verstuurd" : new Date(i.note.updatedAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {Object.keys(state.bible).length > 0 && (
              <section aria-labelledby="offline-bible">
                <h2 id="offline-bible">Bijbel op dit apparaat</h2>
                <ul className="offline-list">
                  {Object.entries(state.bible).map(([code, t]) => (
                    <li key={code}>
                      <button type="button" onClick={() => read(code)}>
                        <span className="title">{t.name}</span>
                        <span className="note-list-meta"> · {t.chapters} hoofdstukken</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
