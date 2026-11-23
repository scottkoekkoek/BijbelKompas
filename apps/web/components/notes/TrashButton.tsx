"use client";
// Ronde 3 §3: throw a draft away, or bring it back from the trash. Throwing away is undoable right
// away (the list shows "Ongedaan maken") and later from the trash. Never offered for a finished note.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RestoreIcon, TrashIcon, UndoIcon } from "@/components/icons";
import { syncEngine } from "@/lib/offline/engine";

type Props = { id: string; title: string; mode: "weggooien" | "terugzetten" | "ongedaan"; compact?: boolean; after?: string };

export function TrashButton({ id, title, mode, compact = false, after }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = title || "Naamloze notitie";

  async function run() {
    setBusy(true);
    setError("");
    try {
      // text still waiting on this device goes first, so nothing is lost in the trash
      if (mode === "weggooien") await syncEngine.syncNow().catch(() => undefined);
      const res = await fetch(`/api/v1/notes/${id}/trash`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trashed: mode === "weggooien" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error?.message ?? "Dat is niet gelukt. Het concept is niet verplaatst.");
        return;
      }
      void syncEngine.syncSoon(0);
      if (after) router.push(after);
      router.refresh();
    } catch {
      setError("Geen verbinding. Het concept is niet verplaatst.");
    } finally {
      setBusy(false);
    }
  }

  const label = mode === "weggooien" ? "Verwijderen" : mode === "terugzetten" ? "Terugzetten" : "Ongedaan maken";
  const Icon = mode === "weggooien" ? TrashIcon : mode === "terugzetten" ? RestoreIcon : UndoIcon;
  return (
    <>
      <button
        type="button"
        className={compact ? "icon-button trash-button" : `button ${mode === "weggooien" ? "ghost danger-text" : "secondary"} small`}
        onClick={() => void run()}
        disabled={busy}
        aria-label={compact ? `${label}: ${name}` : undefined}
        title={compact ? label : undefined}
      >
        <Icon size={16} />
        {!compact && label}
      </button>
      {error && (
        <span className="trash-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
