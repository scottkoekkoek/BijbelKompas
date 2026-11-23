"use client";
/** BK-033: what is waiting, what conflicted, and how much this browser stores. */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { syncLabel, useSyncState } from "@/components/sync/SyncStatus";
import { listConflicts, listOutbox, listStored, storageEstimate, storeOfOtherAccount } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";
import type { ConflictRecord, OutboxEntry } from "@/lib/offline/types";

type Data = {
  outbox: OutboxEntry[];
  conflicts: ConflictRecord[];
  titles: Record<string, string>;
  stored: number;
  pinned: number;
  storage: { usage: number; quota: number; persisted: boolean } | null;
};

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
const when = (t: number | null) =>
  t ? new Date(t).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "nog niet";

export function SyncOverview() {
  const state = useSyncState();
  const [data, setData] = useState<Data | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [persistMsg, setPersistMsg] = useState("");
  const [otherAccount, setOtherAccount] = useState(false);

  const load = useCallback(async () => {
    try {
      // pilot: another account's unsent text on this browser is never shown here
      if (await storeOfOtherAccount()) {
        setOtherAccount(true);
        return;
      }
      const [outbox, conflicts, stored, storage] = await Promise.all([listOutbox(), listConflicts(), listStored(), storageEstimate()]);
      const titles: Record<string, string> = {};
      for (const s of stored) titles[s.id] = (s.local ?? s.server)?.title || "Naamloze notitie";
      setData({ outbox, conflicts, titles, stored: stored.length, pinned: stored.filter((s) => s.pinned).length, storage });
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from IndexedDB on mount
    void load();
    const off = syncEngine.subscribe(() => void load());
    return () => {
      off();
    };
  }, [load]);

  if (unavailable) {
    return <p className="alert error">Deze browser kan niets lokaal bewaren (bijvoorbeeld in een privévenster). Offline schrijven werkt hier niet; online werkt alles gewoon.</p>;
  }
  if (otherAccount) {
    return (
      <p className="alert info">
        Op deze browser staan nog niet verstuurde wijzigingen van een ander account. Ze blijven bewaard en worden verstuurd zodra dat account
        hier weer inlogt. Jouw eigen wijzigingen gaan zolang direct naar de server, dus offline schrijven werkt hier even niet.
      </p>
    );
  }
  if (!data) return <p role="status">Laden…</p>;

  const waiting = data.outbox.filter((e) => !e.blocked);
  const rejected = data.outbox.filter((e) => e.blocked === "rejected");
  const open = data.conflicts.filter((c) => !c.resolved).sort((a, b) => b.at - a.at);

  return (
    <>
      <section className="settings-section" aria-labelledby="sync-status">
        <h2 id="sync-status">Status</h2>
        <p>
          <strong>{syncLabel(state).text}</strong>. Laatst gesynchroniseerd: {when(state.lastSyncAt)}.
        </p>
        <button type="button" className="button secondary" onClick={() => void syncEngine.syncNow()} disabled={state.status === "syncing"}>
          Nu synchroniseren
        </button>
      </section>

      <section className="settings-section" aria-labelledby="sync-waiting">
        <h2 id="sync-waiting">Nog niet verstuurd</h2>
        {waiting.length === 0 ? (
          <p>Alles is verstuurd.</p>
        ) : (
          <ul>
            {waiting.map((e) => (
              <li key={e.noteId}>
                <Link href={`/offline?notitie=${e.noteId}`}>{data.titles[e.noteId] ?? "Naamloze notitie"}</Link>
                {e.createdLocally ? " (nieuw, offline gemaakt)" : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section" aria-labelledby="sync-conflicts">
        <h2 id="sync-conflicts">Conflictkopieën</h2>
        <p className="page-intro">
          Als een notitie op twee plaatsen tegelijk is gewijzigd, bewaren we jouw tekst als aparte kopie. Er wordt nooit iets
          overschreven. Vergelijk de twee, neem over wat je wilt houden en markeer het conflict als afgehandeld.
        </p>
        {open.length === 0 ? (
          <p>Geen open conflicten.</p>
        ) : (
          <ul className="offline-list">
            {open.map((c) => (
              <li key={c.id} className="conflict-row">
                <p>
                  <strong>{c.title || "Naamloze notitie"}</strong> · {when(c.at)}
                </p>
                <div className="button-row">
                  <Link className="button secondary" href={`/notes/${c.noteId}`}>Origineel</Link>
                  <Link className="button secondary" href={`/offline?notitie=${c.copyNoteId}`}>Mijn kopie</Link>
                  <button type="button" className="button" onClick={() => void syncEngine.markConflictResolved(c.id)}>
                    Afgehandeld
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejected.length > 0 && (
        <section className="settings-section" aria-labelledby="sync-rejected">
          <h2 id="sync-rejected">Geweigerd</h2>
          <p className="page-intro">De server nam deze wijzigingen niet aan. De tekst staat nog op dit apparaat.</p>
          <ul>
            {rejected.map((e) => (
              <li key={e.noteId}>
                <Link href={`/offline?notitie=${e.noteId}`}>{data.titles[e.noteId] ?? "Naamloze notitie"}</Link>: {e.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="settings-section" aria-labelledby="sync-storage">
        <h2 id="sync-storage">Op dit apparaat</h2>
        <p>
          {data.stored} {data.stored === 1 ? "notitie" : "notities"} offline beschikbaar, waarvan {data.pinned} vastgezet.
          {data.storage && ` Gebruikt: ${mb(data.storage.usage)} van ${mb(data.storage.quota)}.`}
        </p>
        {data.storage && !data.storage.persisted && (
          <>
            <p className="page-intro">
              De browser mag offline gegevens opruimen als de schijf vol raakt. Vraag de browser om ze te bewaren.
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={async () => {
                const ok = (await navigator.storage.persist?.()) ?? false;
                setPersistMsg(ok ? "De browser bewaart je offline notities nu blijvend." : "De browser heeft het verzoek niet toegestaan.");
                void load();
              }}
            >
              Offline gegevens blijvend bewaren
            </button>
          </>
        )}
        {persistMsg && <p role="status">{persistMsg}</p>}
      </section>
    </>
  );
}
