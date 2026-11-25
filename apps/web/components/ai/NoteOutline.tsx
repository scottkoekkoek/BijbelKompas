"use client";
/**
 * ADR-018: an AI outline and summary of a finished note. It is a proposal next to the note: the note
 * is never changed. Ronde 3 §5: the main action is "Opslaan bij deze notitie" (a separate section of
 * the same note, see LinkedSummary); copying or saving as a new note stay as secondary choices.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { outlineDocument, outlineText } from "@/lib/ai/outline-document";

type Outline = {
  id: string;
  summary: string;
  mainThought: string;
  points: { heading: string; details: string[] }[];
  application: string;
  model: string;
  stale: boolean;
};
type Props = {
  noteId: string;
  title: string;
  noteType: string;
  aiEnabled: boolean;
  provider: { name: string; external: boolean } | null;
  /** the outline whose summary is saved with the note, if any (Ronde 3 §5) */
  savedOutlineId?: string | null;
  hasSaved?: boolean;
};

export function NoteOutline({ noteId, title, noteType, aiEnabled, provider, savedOutlineId = null, hasSaved = false }: Props) {
  const router = useRouter();
  const [outline, setOutline] = useState<Outline | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const opened = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/outline`, { cache: "no-store" });
      if (res.ok) setOutline(((await res.json()) as { outline: Outline | null }).outline);
    } catch {
      /* nothing to show */
    }
  }, [noteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from the server on mount
    void load();
  }, [load]);

  // open once when there is an outline to see; after that the owner decides
  useEffect(() => {
    if (opened.current || outline === null) return;
    opened.current = true;
    if (hasSaved) return; // the saved summary already shows it (Ronde 3 §5)
    if (details.current) details.current.open = true;
  }, [outline, hasSaved]);

  async function make() {
    setBusy(true);
    setStatus("Opzet wordt gemaakt…");
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/outline`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(body?.error?.message ?? "De opzet is mislukt. Je notitie is niet veranderd.");
        return;
      }
      setOutline(body.outline as Outline);
      setStatus(body.reused ? "Van deze versie is al een opzet gemaakt; er is niets opnieuw betaald." : "Opzet ontvangen. Je notitie is niet veranderd.");
    } catch {
      setStatus("Geen verbinding. Probeer het later opnieuw.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWithNote() {
    if (!outline) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/notes/${noteId}/summary`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outlineId: outline.id }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus(body?.error?.message ?? "Opslaan is mislukt. Een eerder bewaarde samenvatting is niet veranderd.");
        return;
      }
      setConfirmReplace(false);
      setStatus("Samenvatting bewaard bij deze notitie.");
      router.refresh();
    } catch {
      setStatus("Geen verbinding. Er is niets veranderd.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!outline) return;
    try {
      await navigator.clipboard.writeText(outlineText(outline));
      setStatus("Opzet gekopieerd.");
    } catch {
      setStatus("Kopiëren lukt niet in deze browser.");
    }
  }

  async function saveAsNote() {
    if (!outline) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: `Opzet: ${title || "Naamloze notitie"}`.slice(0, 200),
          noteType,
          document: outlineDocument(outline, title, () => crypto.randomUUID()),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const note = (await res.json()) as { id: string };
      router.push(`/notes/${note.id}`);
    } catch {
      setStatus("De nieuwe notitie kon niet worden aangemaakt. Probeer het opnieuw.");
      setBusy(false);
    }
  }

  return (
    <details ref={details} className="ai-outline" id="opzet">
      <summary>Samenvatting en opzet</summary>
      {outline && (
        <div className="card ai-answer">
          {outline.stale && (
            <p>
              <span className="badge">Verouderd</span> <span className="muted">De notitie is gewijzigd sinds deze opzet.</span>
            </p>
          )}
          {outline.mainThought.trim() && outline.mainThought.trim() !== "-" && (
            <>
              <h3>Kerngedachte</h3>
              <p>{outline.mainThought}</p>
            </>
          )}
          <h3>Samenvatting</h3>
          <p>{outline.summary}</p>
          {outline.points.length > 0 && (
            <>
              <h3>Opzet</h3>
              <ol>
                {outline.points.map((p, i) => (
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
            </>
          )}
          {outline.application.trim() && (
            <>
              <h3>Toepassing</h3>
              <p>{outline.application}</p>
            </>
          )}
          <p className="muted">Voorstel van {outline.model}. Je notitie zelf blijft zoals hij is.</p>
          <div className="button-row">
            {outline.id === savedOutlineId ? (
              <span className="badge afgerond">Bewaard bij deze notitie</span>
            ) : hasSaved && !confirmReplace ? (
              <button type="button" className="button" onClick={() => setConfirmReplace(true)} disabled={busy}>
                Vervang de bewaarde samenvatting
              </button>
            ) : confirmReplace ? (
              <>
                <span className="muted">De bewaarde samenvatting vervangen door deze?</span>
                <button type="button" className="button" onClick={() => void saveWithNote()} disabled={busy}>
                  Ja, vervangen
                </button>
                <button type="button" className="button secondary" onClick={() => setConfirmReplace(false)} disabled={busy}>
                  Annuleren
                </button>
              </>
            ) : (
              <button type="button" className="button" onClick={() => void saveWithNote()} disabled={busy}>
                Opslaan bij deze notitie
              </button>
            )}
            <button type="button" className="button ghost" onClick={() => void copy()}>
              Kopieer opzet
            </button>
            <button type="button" className="button ghost" onClick={() => void saveAsNote()} disabled={busy}>
              Als nieuwe notitie opslaan
            </button>
          </div>
        </div>
      )}

      {!aiEnabled ? (
        <p className="muted">AI-hulp staat uit. Je kunt hem aanzetten bij <Link href="/settings">Instellingen</Link>.</p>
      ) : !provider ? (
        <p className="muted">Er is nog geen AI-aanbieder gekozen. Er wordt niets verstuurd.</p>
      ) : outline && !outline.stale ? null : (
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => void make()} disabled={busy}>
            {outline ? "Nieuwe samenvatting maken" : "Samenvatting maken"}
          </button>
          <span className="hint">{provider.external ? `Stuurt deze notitie naar ${provider.name}.` : "Testaanbieder: er gaat niets naar buiten."}</span>
        </div>
      )}
      <p role="status" className="muted">
        {status}
      </p>
    </details>
  );
}
