"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** BK-023: restoring makes a new version; nothing is lost. */
export function RestoreButton({ id, n, baseVersion }: { id: string; n: number; baseVersion: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function restore() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/v1/notes/${id}/revisions/${n}/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseVersion }),
    });
    if (res.ok) {
      router.push(`/notes/${id}`);
      router.refresh();
      return;
    }
    setBusy(false);
    setError(res.status === 409 ? "De notitie is intussen gewijzigd. Laad de pagina opnieuw." : "Terugzetten is mislukt.");
  }
  return (
    <>
      <button type="button" className="button" onClick={restore} disabled={busy}>
        Deze versie terugzetten
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
