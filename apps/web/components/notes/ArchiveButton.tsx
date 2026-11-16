"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/v1/notes/${id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    });
    setBusy(false);
    if (res.ok) router.push(archived ? `/notes/${id}` : "/notes");
    router.refresh();
  }
  return (
    <button type="button" className="button secondary" onClick={toggle} disabled={busy}>
      {archived ? "Terughalen uit archief" : "Archiveren"}
    </button>
  );
}
