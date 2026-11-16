"use client";
import type { CreateNoteInput } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Creates a note (optionally with a Bible reference) and opens it. */
export function NewNoteButton({ input, label = "Nieuwe notitie", className = "button" }: { input?: CreateNoteInput; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input ?? {}),
      });
      if (!res.ok) throw new Error(String(res.status));
      const note = (await res.json()) as { id: string };
      router.push(`/notes/${note.id}`);
    } catch {
      setError("De notitie kon niet worden aangemaakt. Probeer het opnieuw.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={create} disabled={busy}>
        {busy ? "Bezig…" : label}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
