"use client";
import { HIGHLIGHT_COLOR_LABEL, type ChapterHighlight, type HighlightColor } from "@bk/schemas";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HighlightEditor } from "./HighlightEditor";

/** BK-013: the owner's highlights in this chapter, to change or remove. */
export function HighlightList({ highlights }: { highlights: ChapterHighlight[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function send(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/highlights/${id}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error();
      setEditing(null);
      setStatus(method === "DELETE" ? "Markering verwijderd." : "Markering gewijzigd.");
      router.refresh();
    } catch {
      setStatus("Dat is niet gelukt. Probeer het opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  if (highlights.length === 0 && !status) return null;
  return (
    <section className="chapter-notes highlight-list" aria-labelledby="chapter-highlights-title">
      <h2 id="chapter-highlights-title">Markeringen in dit hoofdstuk</h2>
      {highlights.length > 0 && (
        <ul>
          {highlights.map((h) => (
            <li key={h.id}>
              <span className={`swatch hl-${h.color}`} aria-hidden="true" />
              <strong>{h.label}</strong>
              <span className="muted"> · {HIGHLIGHT_COLOR_LABEL[h.color]}</span>
              {h.annotation && <p className="highlight-annotation">{h.annotation}</p>}
              {editing === h.id ? (
                <HighlightEditor
                  initialColor={h.color}
                  initialAnnotation={h.annotation}
                  saveLabel="Wijziging opslaan"
                  busy={busy}
                  onSave={(color: HighlightColor, annotation) => void send(h.id, "PATCH", { color, annotation })}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <div className="selection-actions">
                  <button type="button" className="button secondary small" onClick={() => setEditing(h.id)} aria-label={`Markering ${h.label} wijzigen`}>
                    Wijzigen
                  </button>
                  <button type="button" className="button secondary small" disabled={busy} onClick={() => void send(h.id, "DELETE")} aria-label={`Markering ${h.label} verwijderen`}>
                    Verwijderen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="muted">
        {status}
      </p>
    </section>
  );
}
