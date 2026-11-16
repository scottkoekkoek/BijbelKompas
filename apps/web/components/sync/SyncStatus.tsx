"use client";
/**
 * BK-026: starts the sync engine, registers the service worker and shows the sync state.
 * The text is always visible (not only a colour). It is not a live region: a status that changes
 * every minute would keep interrupting a screen reader; the editor announces its own saves.
 */
import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { syncEngine, type SyncState } from "@/lib/offline/engine";

const INITIAL: SyncState = { status: "idle", pending: 0, conflicts: 0, rejected: 0, lastSyncAt: null };

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, () => INITIAL);
}

export function syncLabel(s: SyncState): { text: string; tone: "ok" | "busy" | "warn" } {
  if (s.status === "auth") return { text: "Log opnieuw in om te synchroniseren", tone: "warn" };
  if (s.conflicts > 0) return { text: s.conflicts === 1 ? "1 conflictkopie" : `${s.conflicts} conflictkopieën`, tone: "warn" };
  if (s.rejected > 0) return { text: "Wijziging geweigerd", tone: "warn" };
  if (s.status === "offline") {
    return { text: s.pending > 0 ? `Offline · ${s.pending} ${s.pending === 1 ? "wijziging wacht" : "wijzigingen wachten"}` : "Offline", tone: "warn" };
  }
  if (s.pending > 0) return { text: `${s.pending} ${s.pending === 1 ? "wijziging wacht" : "wijzigingen wachten"}`, tone: "busy" };
  if (s.status === "syncing") return { text: "Synchroniseren…", tone: "busy" };
  if (s.status === "error") return { text: "Synchroniseren mislukt, we proberen het opnieuw", tone: "warn" };
  return { text: "Gesynchroniseerd", tone: "ok" };
}

/** Mount once per page (in the app layout and on the offline page). */
export function SyncStarter() {
  useEffect(() => {
    syncEngine.start();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(async (reg) => {
          await navigator.serviceWorker.ready;
          // keep the offline screen up to date with the deployed version
          (reg.active ?? navigator.serviceWorker.controller)?.postMessage("refresh-offline");
        })
        .catch(() => undefined);
    }
  }, []);
  return null;
}

export function SyncIndicator({ href = "/sync" }: { href?: string }) {
  const s = useSyncState();
  const { text, tone } = syncLabel(s);
  return (
    <Link href={href} className={`sync-indicator ${tone}`} aria-label={`Synchronisatie: ${text}`}>
      <span className="sync-dot" aria-hidden="true" />
      <span>{text}</span>
    </Link>
  );
}
