"use client";
// Ronde 3 §5: the AI summary saved with this note, shown as its own section in the reading view.
// It never changes the note. When the note changed afterwards, that is shown, with the version the
// summary was made from and a way to make a new one. Deleting or replacing is always deliberate.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { NoteSummarySection } from "@/lib/ai/data";

const dateFmt = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export function LinkedSummary({ summary: s }: { summary: NoteSummarySection }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/notes/${s.noteId}/summary`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setStatus("Verwijderen is mislukt. De samenvatting staat er nog.");
      setBusy(false);
      setConfirming(false);
    }
  }

  function makeNew() {
    const panel = document.getElementById("opzet") as HTMLDetailsElement | null;
    if (!panel) return;
    panel.open = true;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.querySelector<HTMLElement>("summary")?.focus();
  }

  return (
    <section className="linked-summary" aria-labelledby="linked-summary-title">
      <h2 id="linked-summary-title">Samenvatting</h2>
      {s.stale && (
        <div className="alert info">
          <p>
            De notitie is gewijzigd nadat deze samenvatting is gemaakt. Ze hoort bij{" "}
            {s.sourceRevision > 0 ? <Link href={`/notes/${s.noteId}/versies/${s.sourceRevision}`}>versie {s.sourceRevision}</Link> : "de eerste tekst"}
            {s.currentRevision !== s.sourceRevision ? `; de notitie staat nu op versie ${s.currentRevision}` : ""}. Vergelijk ze, en maak zo nodig een nieuwe
            samenvatting.
          </p>
          <button type="button" className="button secondary small" onClick={makeNew}>
            Nieuwe samenvatting maken
          </button>
        </div>
      )}
      {s.mainThought.trim() && s.mainThought.trim() !== "-" && <p className="linked-summary-main">{s.mainThought}</p>}
      <p>{s.summary}</p>
      {s.points.length > 0 && (
        <ol>
          {s.points.map((p, i) => (
            <li key={i}>
              {p.heading}
              {p.details.length > 0 && (
                <ul>
                  {p.details.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {s.application.trim() && (
        <p>
          <strong>Toepassing:</strong> {s.application}
        </p>
      )}
      <p className="hint">
        Gemaakt met AI ({s.model}) en bewaard op {dateFmt.format(new Date(s.savedAt))}
        {s.sourceRevision > 0 ? `, bij versie ${s.sourceRevision}` : ""}. Je eigen tekst hierboven is niet veranderd.
      </p>
      <div className="button-row">
        {confirming ? (
          <>
            <span className="muted">Samenvatting verwijderen? De notitie blijft zoals hij is.</span>
            <button type="button" className="button danger small" onClick={() => void remove()} disabled={busy}>
              Ja, verwijderen
            </button>
            <button type="button" className="button secondary small" onClick={() => setConfirming(false)} disabled={busy}>
              Annuleren
            </button>
          </>
        ) : (
          <button type="button" className="button ghost small" onClick={() => setConfirming(true)}>
            Samenvatting verwijderen
          </button>
        )}
      </div>
      <p role="status" className="muted">
        {status}
      </p>
    </section>
  );
}
