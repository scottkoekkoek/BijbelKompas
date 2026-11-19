"use client";
/**
 * BK-056: safe logout. With unsent changes the writer is warned first and the local data stays;
 * without them, this browser's offline copy is wiped before signing out.
 */
import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { listOutbox, wipeAll } from "@/lib/offline/db";
import { syncEngine } from "@/lib/offline/engine";
import { LogOutIcon } from "@/components/icons";

export function LogoutButton() {
  const id = useId();
  const [waiting, setWaiting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (waiting !== null) dialog.current?.focus();
  }, [waiting]);

  async function unsent(): Promise<number> {
    try {
      return (await listOutbox()).length;
    } catch {
      return 0; // no local storage in this browser: nothing can be lost
    }
  }

  async function start() {
    setBusy(true);
    await syncEngine.syncNow().catch(() => undefined);
    const n = await unsent();
    if (n > 0) {
      setBusy(false);
      setWaiting(n);
      return;
    }
    await leave(true);
  }

  async function leave(wipe: boolean) {
    setBusy(true);
    if (wipe) await wipeAll().catch(() => undefined);
    await signOut();
  }

  return (
    <>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void start()} title="Uitloggen">
        <LogOutIcon />
        <span className="button-label">Uitloggen</span>
      </button>
      {waiting !== null && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setWaiting(null)}>
          <div
            ref={dialog}
            tabIndex={-1}
            className="modal logout-warning"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${id}-t`}
            aria-describedby={`${id}-d`}
            onKeyDown={(e) => e.key === "Escape" && setWaiting(null)}
          >
            <h2 id={`${id}-t`}>Er {waiting === 1 ? "is 1 wijziging" : `zijn ${waiting} wijzigingen`} nog niet verstuurd.</h2>
            <p id={`${id}-d`} className="muted">
              Als je nu uitlogt, blijft je tekst op dit apparaat bewaard en wordt hij verstuurd zodra je hier weer inlogt.
              Maak eerst verbinding met internet als je hem op andere apparaten wilt zien.
            </p>
            <div className="button-row">
              <button type="button" className="button secondary" disabled={busy} onClick={() => void leave(false)}>
                Toch uitloggen (tekst blijft op dit apparaat)
              </button>
              <button type="button" className="button" onClick={() => setWaiting(null)}>Ingelogd blijven</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
